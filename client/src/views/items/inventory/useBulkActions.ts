/**
 * FR-24.9 and what widened it: what a selection of rows can be acted on with —
 * a tag given or taken, a default assignee (FR-1.9), a dependency (FR-20.1),
 * a merge into one of them (FR-24.15) and a retire (FR-24.3).
 */
import { actionSheetController } from '@ionic/vue'
import { attachOutline, gitMergeOutline, linkOutline, personOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import type { BulkTagMode } from '@/components/items/BulkTagSheet.vue'
import type { MergeCandidate } from '@/components/items/MergeItemsSheet.vue'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import {
  DEPENDENCY_LINK_COMPANION,
  DEPENDENCY_LINK_MAIN,
  type DependencyLinkDirection,
} from '@/domain/dependencies'
import { DELETION_RETIRE } from '@/domain/masterDeletion'
import { tagCounts, tagsOfItems } from '@/domain/tags'
import { t } from '@/i18n'
import { confirmDestructive } from '@/composables/shared/confirm'
import { bulkRetireSentence } from '@/lib/deletionLabels'
import { sheetBandAttrs } from '@/lib/sheetBands'
import { presentToast } from '@/composables/shared/toast'
import { useMasterStore } from '@/stores/masterStore'
import type { DependencyMode } from '@/types/domain'

import type { InventoryCore } from './useInventoryCore'

/** What the ⋯ sheet offers besides the two tag actions. */
const MORE_ASSIGNEE = 'assignee'
/** FR-24.15: merge the picked rows into one of them. */
const MORE_MERGE = 'merge'
type MoreAction = typeof MORE_ASSIGNEE | typeof MORE_MERGE | DependencyLinkDirection

/** The batch's sheets, their numbers and the acts; call once per screen. */
export function useBulkActions(core: InventoryCore) {
  const masterStore = useMasterStore()
  const orchestrator = useOrchestrator()
  const { selected, selectedItems, endSelecting, canAssign, userName } = core

  const bulkSheet = ref<BulkTagMode | null>(null)
  const assigneeSheet = ref(false)
  /** FR-24.15: which of the picked rows stays. */
  const mergeSheet = ref(false)
  const dependencySheet = ref<DependencyLinkDirection | null>(null)

  /**
   * The tags a bulk action may act with (FR-24.9): giving offers the whole
   * vocabulary, taking offers only what the selection carries — an action that
   * can change nothing is not offered.
   */
  const bulkTags = computed(() =>
    bulkSheet.value === 'take'
      ? tagsOfItems(selectedItems.value, masterStore.itemTagList, masterStore.tagList)
      : masterStore.tagList,
  )

  /** How many of the *selected* items already carry each tag. */
  const bulkCounts = computed(() => tagCounts(selectedItems.value, masterStore.itemTagList))

  /**
   * The last batch's undo, live for as long as its snackbar (FR-24.9). One
   * batch at a time. A retire is deliberately not in here — see
   * `retireSelected`.
   *
   * A closure rather than a record, because the actions do not undo the same
   * *shape*: a tag batch puts assignments back where they were, an assignee
   * batch writes each item's own previous value, a link removes rows that were
   * not there before. Each action's own group knows how to reverse it, so what
   * the screen holds is the call, not the data (`useRowUndo` is the same shape).
   */
  let bulkUndo: (() => void) | null = null

  function undoBulk() {
    const undo = bulkUndo
    bulkUndo = null
    undo?.()
  }

  async function announceBulk(message: string) {
    await presentToast({
      message,
      buttons: [{ text: t('items.bulkUndo'), handler: () => undoBulk() }],
    })
  }

  /**
   * Give the chosen tag to the selection, optionally filing them under it.
   * `fresh` says the tag was created for this batch, so the undo removes it too.
   */
  async function giveTag(tagId: string, primary: boolean, fresh = false) {
    const { touched, undo } = orchestrator.masterData.giveTagToItems(
      selectedItems.value,
      tagId,
      primary,
      fresh,
    )
    bulkSheet.value = null
    if (touched === 0) {
      await presentToast({ message: t('items.bulkNothingToDo') })
      return
    }
    bulkUndo = () => orchestrator.masterData.undoBulkTag(undo)
    endSelecting()
    await announceBulk(
      t(fresh ? 'items.bulkGaveNew' : 'items.bulkGave', { n: touched, tag: tagName(tagId) }),
    )
  }

  /** FR-24.9: the typed name no tag held — create it, then give it like any other. */
  async function createAndGive({ name, primary }: { name: string; primary: boolean }) {
    await giveTag(orchestrator.masterData.createTag(name), primary, true)
  }

  /** Take the chosen tag away from every selected item that carries it. */
  async function takeTag(tagId: string) {
    const { touched, undo } = orchestrator.masterData.takeTagFromItems(selectedItems.value, tagId)
    bulkSheet.value = null
    if (touched === 0) {
      await presentToast({ message: t('items.bulkNothingToDo') })
      return
    }
    bulkUndo = () => orchestrator.masterData.undoBulkTag(undo)
    endSelecting()
    await announceBulk(t('items.bulkTook', { n: touched, tag: tagName(tagId) }))
  }

  function tagName(tagId: string): string {
    return masterStore.tagList.find((tag) => tag.id === tagId)?.name ?? tagId
  }

  /**
   * The three later actions live behind one glyph rather than beside the two
   * tag ones (FR-24.9): at 390 px the bar carries four controls before the
   * labels clip, and the two tag actions are the ones the mode was measured on.
   * A sheet also has room for the words each of these needs — „Hängt ab von"
   * alone does not say which end of the edge the selection is on.
   */
  async function openMore() {
    const sheet = await actionSheetController.create({
      header: t('items.bulkMoreTitle'),
      buttons: [
        // G-8: absent where there is nobody to assign to, not offered and refused.
        ...(canAssign.value
          ? [{ text: t('items.bulkAssignee'), icon: personOutline, data: MORE_ASSIGNEE }]
          : []),
        { text: t('items.bulkDependsOn'), icon: linkOutline, data: DEPENDENCY_LINK_MAIN },
        { text: t('items.bulkCompanion'), icon: attachOutline, data: DEPENDENCY_LINK_COMPANION },
        // FR-24.15: two rows are the fewest that can be the same thing. G-14's
        // destructive band: every row but the survivor goes, with no undo.
        ...(selected.value.size > 1
          ? [
              {
                text: t('items.bulkMerge'),
                icon: gitMergeOutline,
                data: MORE_MERGE,
                ...sheetBandAttrs('destructive'),
              },
            ]
          : []),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    })
    await sheet.present()
    const { data, role } = await sheet.onDidDismiss()
    if (role === 'cancel' || typeof data !== 'string') return
    const action = data as MoreAction
    if (action === MORE_ASSIGNEE) assigneeSheet.value = true
    else if (action === MORE_MERGE) mergeSheet.value = true
    else dependencySheet.value = action
  }

  /** How many of the selection already name each account, and how many nobody. */
  const assigneeCounts = computed(() => {
    const counts = new Map<string, number>()
    for (const item of selectedItems.value) {
      const id = item.default_assignee_id ?? null
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  })

  const unassignedCount = computed(
    () => selectedItems.value.filter((item) => !item.default_assignee_id).length,
  )

  /** Name who the selection is usually assigned to, or nobody (FR-1.9). */
  async function assignSelected({ userId }: { userId: string | null }) {
    const { touched, undo } = orchestrator.masterData.assignDefaultAssignee(
      selectedItems.value,
      userId,
    )
    assigneeSheet.value = false
    if (touched === 0) {
      await presentToast({ message: t('items.bulkNothingToDo') })
      return
    }
    bulkUndo = () => orchestrator.masterData.undoBulkAssignee(undo)
    endSelecting()
    await announceBulk(
      userId
        ? t('items.bulkAssigned', { n: touched, name: userName(userId) })
        : t('items.bulkUnassigned', { n: touched }),
    )
  }

  /**
   * The picked rows as FR-24.15's sheet reads them: the tags they carry and how
   * much of the product resolves against each — the two facts the choice of
   * survivor actually turns on.
   */
  const mergeCandidates = computed<MergeCandidate[]>(() =>
    selectedItems.value.map((item) => ({
      item,
      tags: masterStore.getItemTags(item.id).map((tag) => tag.name),
      uses: orchestrator.masterData.masterItemDeletionOutlook(item.id).references,
    })),
  )

  /**
   * FR-24.15: merge the selection into the row the sheet names.
   *
   * The confirm is what the act owes — it has no undo, and the losing rows are
   * retired or removed by FR-24.3 at the end of it. Afterwards the screen says
   * what was *taken over*, because the survivor quietly gaining a weight, a
   * photo or a mark is the part a user cannot see from the list.
   */
  async function mergeSelected(survivorId: string) {
    const losers = selectedItems.value.filter((item) => item.id !== survivorId)
    const survivor = masterStore.getItem(survivorId)
    mergeSheet.value = false
    if (!survivor || losers.length === 0) return

    const ok = await confirmDestructive({
      header: t('items.mergeTitle'),
      message: t('items.mergeConfirmBody', { n: losers.length, name: survivor.name }),
      confirmLabel: t('items.mergeConfirm'),
      testid: 'm9-merge-confirm',
    })
    if (!ok) return

    const photoFrom = survivor.image_hash ? null : losers.find((item) => item.image_hash)
    const outcome = orchestrator.masterData.mergeMasterItems(
      survivorId,
      losers.map((item) => item.id),
    )
    // The bytes are the one part of a merge that is not a mutation (ADR-002),
    // so they move after the rows and only where the survivor had no photo.
    if (photoFrom) await orchestrator.images.copyItemImage(photoFrom, survivor)

    endSelecting()
    await announceBulk(
      [
        t('items.merged', { n: outcome.merged, name: survivor.name }),
        outcome.filled.length > 0 || photoFrom
          ? t('items.mergedTook', {
              what: [
                ...outcome.filled.map((field) => t(`items.field.${field}`)),
                ...(photoFrom ? [t('items.field.photo')] : []),
              ].join(', '),
            })
          : '',
        outcome.positions > 0 ? t('items.mergedPositions', { n: outcome.positions }) : '',
        outcome.edgesDropped > 0 ? t('items.mergedEdges', { n: outcome.edgesDropped }) : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  /**
   * Link the selection to one item (FR-20.1 over FR-24.9), in the direction the
   * sheet was opened for.
   *
   * **The result names what was skipped rather than hiding it.** A batch is
   * planned per item (`planDependencyBatch`), so a selection holding the picked
   * item itself, or one already linked, or one the edge would send in a circle,
   * writes the rest and reports the remainder — an all-or-nothing refusal would
   * leave the user to find the offender among fifty rows.
   */
  async function linkSelected({ itemId, mode }: { itemId: string; mode: DependencyMode }) {
    const direction = dependencySheet.value
    if (!direction) return
    const { plan, undo } = orchestrator.dependencies.linkItemsToDependency(
      selectedItems.value,
      itemId,
      direction,
      mode,
    )
    dependencySheet.value = null

    const written = plan.edges.length
    if (written === 0) {
      await presentToast({ message: t('items.bulkLinkedNothing') })
      return
    }
    bulkUndo = () => orchestrator.dependencies.undoBulkDependency(undo)
    endSelecting()

    const linked = t('items.bulkLinked', { n: written, name: itemName(itemId) })
    const skipped = plan.skipped.length
    // Two sentences, joined here rather than in the catalogue: the skipped
    // half has its own plural, and one entry cannot carry two of them.
    await announceBulk(
      skipped > 0 ? `${linked}. ${t('items.bulkLinkedSkipped', { n: skipped })}` : linked,
    )
  }

  function itemName(itemId: string): string {
    return masterStore.getItem(itemId)?.name ?? itemId
  }

  /**
   * Retire the selection (FR-24.9 over FR-24.3).
   *
   * The confirm states **both** numbers, because a delete is two different acts
   * and a batch spanning them may not report one of them: a row something
   * references is hidden and kept, one nothing has ever used is removed for
   * good. There is deliberately **no undo** — the removed half cannot come back
   * (nothing was tombstoned to restore), so the honest safety is the sentence
   * before the act, which is also what M10's own delete card does. The hidden
   * half is recoverable where it always was, on M23.
   */
  async function retireSelected() {
    const items = selectedItems.value
    if (items.length === 0) return
    const outlooks = items.map((item) => orchestrator.masterData.masterItemDeletionOutlook(item.id))
    const hidden = outlooks.filter((o) => o.kind === DELETION_RETIRE).length
    const removed = items.length - hidden

    const ok = await confirmDestructive({
      header: t('items.bulkRetireTitle', { n: items.length }),
      message: bulkRetireSentence(hidden, removed),
      confirmLabel: t('items.bulkRetireConfirm'),
      testid: 'm9-bulk-retire-confirm',
    })
    if (!ok) return

    for (const item of items) orchestrator.masterData.deleteMasterItem(item.id)
    bulkUndo = null
    endSelecting()
    await presentToast({ message: t('items.bulkRetired', { n: items.length }) })
  }

  return {
    bulkSheet,
    assigneeSheet,
    mergeSheet,
    dependencySheet,
    bulkTags,
    bulkCounts,
    giveTag,
    createAndGive,
    takeTag,
    openMore,
    assigneeCounts,
    unassignedCount,
    assignSelected,
    mergeCandidates,
    mergeSelected,
    linkSelected,
    retireSelected,
  }
}
