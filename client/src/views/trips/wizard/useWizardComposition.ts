/**
 * M3 step 3 — what the trip is composed of: the picked templates in their two
 * scopes (FR-27.6), single items beside them (FR-27.3), and the live
 * generation the preview reports (FR-2.2/2.3a/15.2), companions included
 * (FR-20.2–20.4).
 */
import { computed, ref } from 'vue'

import {
  PREVIEW_ROW_NAMES,
  previewLines,
  resolvedLines,
  type LinePreview,
} from '@/domain/templates'
import { resolveDependencies } from '@/domain/dependencies'
import { generateTripItems } from '@/domain/instantiate'
import { MIN_SEARCH_LENGTH, useMasterStore } from '@/stores/masterStore'
import type { Template, TemplateKind } from '@/types/domain'
import type { WizardMetadata } from './useWizardMetadata'
import type { WizardTravelers } from './useWizardTravelers'

/** How many inventory matches the FR-27.3 picker offers at once (as M4's). */
const SUGGESTION_LIMIT = 5

/**
 * FR-27.6: the two scopes are separate sections here, mirroring M7 — a
 * Ferien-Vorlage is what a trip starts from, groups are what you add to it.
 *
 * Rows are built in a computed and sorted **by name**, as M7 does: the store's
 * list follows Map insertion, which follows whatever order the sync or
 * IndexedDB produced, so an unsorted section reads differently on two devices.
 * Each row's count is what picking it would actually add — the resolved
 * composition, not the template's own positions (FR-27.2), which for a
 * Ferien-Vorlage are frequently none. Resolving here rather than in the
 * template keeps a checkbox tap from re-resolving every row.
 */
interface ScopeRow {
  template: Template
  count: number
  /** FR-27.12: the first few names, so the row answers the easy case itself. */
  preview: LinePreview
}

/** Step 3's draft and the generation it produces. */
export type WizardComposition = ReturnType<typeof useWizardComposition>

/**
 * Builds {@link WizardComposition}. Generation reads step 1's duration and
 * attributes and step 2's roster, so what M3 previews is what it creates.
 */
export function useWizardComposition(metadata: WizardMetadata, roster: WizardTravelers) {
  const masterStore = useMasterStore()

  const selectedTemplateIds = ref<Set<string>>(new Set())

  function toggleTemplate(id: string, checked: boolean) {
    const next = new Set(selectedTemplateIds.value)
    if (checked) next.add(id)
    else next.delete(id)
    selectedTemplateIds.value = next
  }

  /**
   * FR-27.3: single master items, picked beside the templates.
   *
   * Deliberately *not* the M4/M8 quick-add (`QuickAddItem`), which the §3.25
   * consistency directive would otherwise suggest: that composer exists to
   * write a row, free text included, and to stay open while a run of rows is
   * entered. This is a picker — inventory only, because a name nobody owns has
   * no weight, no tag and nothing for FR-27.5 to recognise a year later. What
   * the two share is the *rule*, `masterStore.searchItems`, which is the part
   * that must never diverge.
   */
  const singleItemIds = ref<string[]>([])
  const itemQuery = ref('')

  const itemSuggestions = computed(() => {
    const query = itemQuery.value.trim()
    if (query.length < MIN_SEARCH_LENGTH) return []
    const picked = new Set(singleItemIds.value)
    return masterStore
      .searchItems(query)
      .filter((i) => !picked.has(i.id))
      .slice(0, SUGGESTION_LIMIT)
  })

  /**
   * The picks as chips, in the order they were made — the user's own order. An
   * id the inventory no longer answers to is dropped rather than rendered as a
   * raw uuid: generation ignores it too, so the chip and the count agree.
   */
  const pickedItems = computed(() =>
    singleItemIds.value.flatMap((id) => masterStore.itemList.filter((i) => i.id === id)),
  )

  function addSingleItem(id: string) {
    if (!singleItemIds.value.includes(id)) singleItemIds.value = [...singleItemIds.value, id]
    itemQuery.value = ''
  }

  function removeSingleItem(id: string) {
    singleItemIds.value = singleItemIds.value.filter((other) => other !== id)
  }

  function scopeRows(kind: TemplateKind): ScopeRow[] {
    return masterStore.activeTemplateList
      .filter((tpl) => tpl.kind === kind)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tpl) => {
        const lines = resolvedLines(masterStore.resolve(tpl.id), masterStore.itemList)
        return {
          template: tpl,
          count: lines.length,
          preview: previewLines(lines, PREVIEW_ROW_NAMES),
        }
      })
  }

  /** FR-27.12: which group the peek sheet is showing, if any. */
  const peekTemplateId = ref<string | null>(null)

  const vacationTemplates = computed(() => scopeRows('template'))
  const groupTemplates = computed(() => scopeRows('group'))

  /**
   * The Vorlagen that already bring a group along. Picking it again changes
   * nothing — the dedup swallows it — so the row says so rather than letting
   * the user believe they added something (the FR-25.13 duplicate-report rule).
   */
  const bringingVorlagen = computed(() => {
    const byGroup = new Map<string, string[]>()
    for (const id of selectedTemplateIds.value) {
      const picked = masterStore.getTemplate(id)
      if (!picked || picked.kind !== 'template') continue
      for (const inc of masterStore.getIncludes(id)) {
        const names = byGroup.get(inc.included_template_id) ?? []
        names.push(picked.name)
        byGroup.set(inc.included_template_id, names)
      }
    }
    return byGroup
  })

  /** FR-27.7: how many preparations the generated trip will start with. */
  const taskCount = computed(() =>
    generation.value.items.reduce((sum, item) => sum + item.tasks.length, 0),
  )

  /** FR-1.4: the items still waiting for somebody to belong to, named in a row. */
  const unassignableNames = computed(() =>
    generation.value.unassignable.map((u) => u.item_name).join(', '),
  )

  const generation = computed(() => {
    // The whole catalogue, not the picked slice: a picked Ferien-Vorlage pulls in
    // the positions of the Gruppen it includes (FR-27.2), which the wizard does
    // not know about until generation resolves the composition.
    const templates = masterStore.templateList
    return generateTripItems({
      templates,
      selectedTemplateIds: [...selectedTemplateIds.value],
      singleItemIds: singleItemIds.value,
      includes: masterStore.includeList,
      templateItemTasks: masterStore.templateItemTaskList,
      templateTasks: masterStore.templateTaskList,
      templateItems: templates.flatMap((t) => masterStore.getTemplateItems(t.id)),
      masterItems: masterStore.categorisedItemList,
      trip: {
        duration_days: metadata.duration.value,
        attributes: metadata.attributes.value,
        // The preview generates with the links the trip will be created with,
        // so what M3 shows is what FR-1.9 will assign.
        travelers: roster.travelers.value.map((t) => ({
          name: t.name,
          linked_user_id: roster.linkedAccountOf(t),
        })),
      },
    })
  })

  // --- Companion items (FR-20.2–20.4) ---

  const companionResolution = computed(() =>
    resolveDependencies({
      onList: generation.value.items.map((i) => ({
        source_item_id: i.source_item_id,
        quantity: i.quantity,
      })),
      dependencies: masterStore.dependencyList,
      masterItems: masterStore.categorisedItemList,
    }),
  )

  return {
    selectedTemplateIds,
    toggleTemplate,
    itemQuery,
    itemSuggestions,
    pickedItems,
    addSingleItem,
    removeSingleItem,
    peekTemplateId,
    vacationTemplates,
    groupTemplates,
    bringingVorlagen,
    taskCount,
    unassignableNames,
    generation,
    companionResolution,
  }
}
