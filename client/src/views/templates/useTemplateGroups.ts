/**
 * M8's Gruppen section (FR-27.1/27.12/27.13): the picker that offers groups
 * to include, its search, and "Neue Gruppe anlegen…" inline so a missing
 * group never detours through M7.
 *
 * Pulled out of `TemplateEditorPage.vue` because the picker, its search and
 * the new-group flow all read and write through the same three surfaces —
 * `otherGroups`, `includedGroupIds` and the include/create actions — and
 * nothing outside this slice needs them, aside from the two sets the fold
 * offer (FR-27.15) also reads.
 */
import { computed, nextTick, ref, type ComputedRef } from 'vue'

import { IonInput } from '@ionic/vue'

import {
  PICKER_SEARCH_MIN_GROUPS,
  PREVIEW_ROW_NAMES,
  previewLines,
  resolvedLines,
  searchGroups,
} from '@/domain/templates'
import type { GroupSearchCandidate } from '@/domain/templates'
import { t } from '@/i18n'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import type { TemplateInclude } from '@/types/domain'
import { TEMPLATE_KIND_GROUP, TEMPLATE_KIND_TEMPLATE } from '@/types/domain'

/** Builds M8's Gruppen picker, its search, and the inline new-group flow. */
export function useTemplateGroups(
  templateId: string,
  includes: ComputedRef<TemplateInclude[]>,
  toast: (message: string) => Promise<void>,
) {
  const masterStore = useMasterStore()
  const orchestrator = useOrchestrator()

  /** FR-27.12: which included group the peek sheet is showing, if any. */
  const peekTemplateId = ref<string | null>(null)

  /** The first few items of an included group, so the row says what it brought. */
  function groupPreview(id: string): string {
    const lines = resolvedLines(masterStore.resolve(id), masterStore.itemList)
    const preview = previewLines(lines, PREVIEW_ROW_NAMES)
    const names = preview.names.join(' · ')
    return preview.rest > 0 ? `${names} ${t('templates.previewMore', { n: preview.rest })}` : names
  }

  const pickerOpen = ref(false)
  const newGroupOpen = ref(false)
  const newGroupName = ref('')
  const newGroupInput = ref<InstanceType<typeof IonInput> | null>(null)

  /**
   * The Gruppen this Vorlage could point at: every active one but itself. All
   * three group surfaces start here — the picker, its FR-27.13 search and
   * FR-27.15's fold offer — and each had written the pair of conditions out.
   */
  const otherGroups = computed(() =>
    masterStore.activeTemplateList.filter(
      (tpl) => tpl.kind === TEMPLATE_KIND_GROUP && tpl.id !== templateId,
    ),
  )

  /** The Gruppen already included, which three of those surfaces ask about. */
  const includedGroupIds = computed(
    () => new Set(includes.value.map((inc) => inc.included_template_id)),
  )

  /** Groups only, never already-included ones — the two-level rule's picker. */
  const availableGroups = computed(() =>
    otherGroups.value
      .filter((tpl) => !includedGroupIds.value.has(tpl.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )

  function groupName(includedTemplateId: string): string {
    return masterStore.getTemplate(includedTemplateId)?.name ?? t('templates.notFound')
  }

  function groupCount(includedTemplateId: string): number {
    return masterStore.resolve(includedTemplateId).positions.length
  }

  // --- FR-27.13: searching the picker ---

  const pickerQuery = ref('')

  /**
   * Every group the search can look at — the included ones too, flagged: they
   * are hidden while browsing and shown while searching, because a search that
   * silently drops them implies the group does not exist (FR-27.13).
   */
  const searchCandidates = computed<GroupSearchCandidate[]>(() =>
    otherGroups.value.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      itemNames: resolvedLines(masterStore.resolve(tpl.id), masterStore.itemList).map(
        (line) => line.name,
      ),
      included: includedGroupIds.value.has(tpl.id),
    })),
  )

  /** The field appears only above six groups — below, scanning the chips wins. */
  const pickerSearchable = computed(() => searchCandidates.value.length > PICKER_SEARCH_MIN_GROUPS)

  const pickerSearching = computed(() => pickerSearchable.value && pickerQuery.value.trim() !== '')

  /** Results as rows: the hit plus what the FR-27.12 summary line needs. */
  const pickerHits = computed(() =>
    searchGroups(pickerQuery.value, searchCandidates.value).map((hit) => ({
      ...hit,
      name: groupName(hit.id),
      count: groupCount(hit.id),
      preview: groupPreview(hit.id),
    })),
  )

  function closePicker() {
    pickerOpen.value = false
    newGroupOpen.value = false
    newGroupName.value = ''
    pickerQuery.value = ''
  }

  function includeGroup(groupId: string) {
    orchestrator.masterData.addTemplateInclude(templateId, groupId)
    closePicker()
  }

  function removeInclude(includeId: string) {
    orchestrator.masterData.removeTemplateInclude(includeId)
  }

  /**
   * "Neue Gruppe anlegen…" — inline, so a missing block never detours via M7.
   * While searching, the field is prefilled with the query: a no-match search
   * ends in creation with the typed name (FR-27.13, keeping the M7 rule that no
   * row exists until a name does).
   */
  function openNewGroup() {
    newGroupName.value = pickerQuery.value.trim()
    newGroupOpen.value = true
    // The field is v-if-gated, so it exists only after this tick.
    void nextTick(() => newGroupInput.value?.$el.setFocus())
  }

  async function commitNewGroup() {
    const name = newGroupName.value.trim()
    if (!name) return
    // Groups and Vorlagen share one name space (FR-1.6), so the answer depends
    // on which scope holds it. A group of that name is what this picker exists
    // to reference — include it instead of refusing the user their own words.
    // A Vorlage cannot stand in for it, and saying so is the only way the
    // refusal does not read as a bug.
    const taken = orchestrator.names.templateNameCollision(name)
    if (taken?.kind === TEMPLATE_KIND_TEMPLATE) {
      await toast(t('templates.groupNameIsTemplate'))
      return
    }
    if (taken) {
      if (!includes.value.some((i) => i.included_template_id === taken.id)) {
        orchestrator.masterData.addTemplateInclude(templateId, taken.id)
      }
      closePicker()
      await toast(t('templates.groupExists', { name: taken.name }))
      return
    }
    const groupId = orchestrator.masterData.createTemplate(name, TEMPLATE_KIND_GROUP)
    if (groupId === null) return
    orchestrator.masterData.addTemplateInclude(templateId, groupId)
    closePicker()
    await toast(t('templates.groupCreated', { name }))
  }

  return {
    peekTemplateId,
    groupPreview,
    pickerOpen,
    newGroupOpen,
    newGroupName,
    newGroupInput,
    otherGroups,
    includedGroupIds,
    availableGroups,
    groupName,
    groupCount,
    pickerQuery,
    searchCandidates,
    pickerSearchable,
    pickerSearching,
    pickerHits,
    closePicker,
    includeGroup,
    removeInclude,
    openNewGroup,
    commitNewGroup,
  }
}
