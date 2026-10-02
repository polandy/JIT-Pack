/**
 * FR-24.10/24.13/24.14: managing the tags themselves — rename, merge, delete
 * and a tag's mark, behind the tag manager sheet.
 */
import { computed, ref } from 'vue'

import { useOrchestrator } from '@/composables/useOrchestrator'
import { tagDeletion, TAG_DELETE_REFUSED } from '@/domain/tags'
import { t } from '@/i18n'
import { confirmAction, confirmDestructive, promptText } from '@/lib/confirm'
import { promptTagMerge, promptTagMergeMany } from '@/lib/tagMergePrompt'
import { presentToast } from '@/lib/toast'
import { useMasterStore } from '@/stores/masterStore'
import type { Tag } from '@/types/domain'

/** The tag manager's counts and actions; call once, in the page's setup. */
export function useTagManagement() {
  const masterStore = useMasterStore()
  const orchestrator = useOrchestrator()

  /**
   * How many assignments each tag has — the manager's count.
   *
   * Read through `tagDeletion` rather than counted again here, because this
   * number and the one a refused delete reports have to be the same number:
   * a manager saying „0" beside a tag whose delete is then refused is the
   * screen contradicting itself. It also means retired items count, which is
   * right — they still carry their tags, and a cascade would still strip them.
   */
  const tagUsage = computed(
    () =>
      new Map(
        masterStore.tagList.map((tag) => [
          tag.id,
          tagDeletion(tag.id, masterStore.itemTagList).references,
        ]),
      ),
  )

  /** FR-24.10: rename, refusing a name another tag already holds. */
  async function renameTag(tag: Tag) {
    await promptText({
      header: t('items.tagRenameTitle'),
      value: tag.name,
      confirmLabel: t('items.tagRenameConfirm'),
      testid: 'm9-tag-rename-prompt',
      onConfirm: async (name) => {
        if (name === '' || name === tag.name) return
        const result = orchestrator.renameTag(tag.id, name)
        if (!result.ok) {
          await presentToast({ message: t('items.tagNameTaken', { name: result.collision }) })
          // `false` keeps the alert open *with the typed text*, so a near-miss
          // is corrected rather than retyped.
          return false
        }
        await presentToast({ message: t('items.tagRenamed', { name }) })
      },
    })
  }

  /** FR-24.10: merge this tag into another and delete it — the shared flow. */
  async function mergeTag(tag: Tag) {
    await promptTagMerge(tag, {
      tags: masterStore.tagList,
      usage: tagUsage.value.get(tag.id) ?? 0,
      merge: orchestrator.mergeTags,
    })
  }

  /**
   * FR-24.14: merge a whole selection of tags into one of them.
   *
   * The orchestrator's `mergeTagsMany` and not a loop over `mergeTags`: the
   * plan has to be made once over the set, or an item carrying two of the
   * picked tags is re-pointed twice onto the survivor.
   */
  async function mergeTagsSelected(tags: Tag[]) {
    // The manager stays open and the mode stays on: tidying an axis is rarely
    // one merge, and the merged tags leave the selection by themselves — they
    // are gone from `tagList`, which is what the picked set is read against.
    await promptTagMergeMany(tags, {
      usage: tagUsage.value,
      merge: orchestrator.mergeTagsMany,
    })
  }

  /**
   * FR-24.10 / ADR-063: a tag items still carry is not deleted — and the
   * refusal is not a dead end. It states the count and offers the merge,
   * because „geht nicht" without a way forward is what sends a person back to
   * retagging 49 items by hand.
   */
  async function removeTag(tag: Tag) {
    const { kind, references } = tagDeletion(tag.id, masterStore.itemTagList)
    if (kind === TAG_DELETE_REFUSED) {
      const merge = await confirmAction({
        header: t('items.tagInUseTitle', { tag: tag.name }),
        message: t('items.tagInUseBody', { n: references }),
        confirmLabel: t('items.tagInUseConfirm'),
        testid: 'm9-tag-in-use',
      })
      if (merge) await mergeTag(tag)
      return
    }

    const ok = await confirmDestructive({
      header: t('items.tagDeleteTitle', { tag: tag.name }),
      message: t('items.tagDeleteBody'),
      confirmLabel: t('items.tagDeleteConfirm'),
      testid: 'm9-tag-delete-confirm',
    })
    if (!ok) return

    const result = orchestrator.deleteTag(tag.id)
    if (result.ok) await presentToast({ message: t('items.tagDeleted', { tag: tag.name }) })
  }

  /**
   * FR-24.13: the tag whose mark is being chosen. The picker is the item
   * mark's own (FR-28.2), opened over the manager — a sheet over a sheet, like
   * the rename prompt, so the manager is still where the user left it.
   */
  const markingTag = ref<Tag | null>(null)

  function onTagMarkPicked(mark: string | null) {
    if (markingTag.value) orchestrator.setTagMark(markingTag.value.id, mark)
  }

  return {
    tagUsage,
    renameTag,
    mergeTag,
    mergeTagsSelected,
    removeTag,
    markingTag,
    onTagMarkPicked,
  }
}
