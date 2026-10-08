/**
 * The shape of a packing list on screen, whichever list it is — the group
 * folds and fold-all (FR-25.16), the per-person clusters (FR-25.24), the
 * filter panel's facets, switches and grouping (FR-25.11), the chips, and the
 * empty state's reset (FR-25.11e). It needs no `PackingCore`: M4 and an
 * excursion's list (FR-31.6) each hand in their own filter and view.
 */
import { computed, ref } from 'vue'

import { DEFAULT_GROUP_BY, type PackingFilter } from '@/composables/usePackingFilter'
import type { PackingView } from '@/domain/packingView'
import {
  activeChips as chipsFor,
  emptyReason as emptyReasonFor,
  filterFacets as facetsFor,
  filterSwitches as switchesFor,
  groupingAxis,
  SWITCH_KEYS,
} from '@/lib/packingFilterPanel'
import type { GroupBy } from '@/types/domain'

/** One of the filter panel's reveal switches. */
export type RevealKey = (typeof SWITCH_KEYS)[keyof typeof SWITCH_KEYS]

/** What a list hands {@link usePackingListShape}. */
export interface PackingListShapeOptions {
  /** The list's own filter (`usePackingFilter`, under the list's key). */
  filter: PackingFilter
  /** The bar's search (`useContextSearch`): its term and whether its field is open. */
  search: { term: { value: string }; isOpen: { value: boolean } }
  /**
   * The list's view, built over {@link PackingListShape.groupBy} and the two
   * folds this returns — so it is read lazily, once the page has built it.
   */
  view: () => PackingView
  /** The reveal switches the list offers: M4 all three, an excursion Erledigte alone. */
  reveals: readonly RevealKey[]
  /** A grouping the list has nothing for: not offered, and read as the default. */
  withoutGrouping?: GroupBy
  /**
   * Whether a row's menu is up: the release of a hold lands on the overlay
   * rather than on the head, but a dismissed sheet can still deliver the
   * click — the same swallow the rows do, or opening a cluster head's menu
   * would also fold it.
   */
  menuActive: () => boolean
}

/** The shape's state and handlers. */
export type PackingListShape = ReturnType<typeof usePackingListShape>

/** Builds {@link PackingListShape}; call once, in the page's setup. */
export function usePackingListShape(options: PackingListShapeOptions) {
  const { filter, search, view } = options
  const reveals = new Set<string>(options.reveals)

  const collapsedGroups = ref<string[]>([])
  /**
   * FR-25.24: the opened set, not the shut one, because a cluster is shut by
   * default. Keyed like a group's fold so a re-render — or packing one
   * instance — does not close what the user just opened.
   */
  const expandedClusters = ref<string[]>([])

  /** The grouping the list draws: the chosen one, unless the list cannot draw it. */
  const groupBy = computed<GroupBy>(() =>
    filter.groupBy.value === options.withoutGrouping ? DEFAULT_GROUP_BY : filter.groupBy.value,
  )

  const allFolded = computed(
    () => view().groups.length > 0 && view().groups.every((group) => group.collapsed),
  )

  /** Fold-all turns the list into a table of contents, and back (FR-25.16). */
  function toggleFoldAll() {
    collapsedGroups.value = allFolded.value ? [] : view().groups.map((group) => group.key)
  }

  function toggleGroup(key: string) {
    collapsedGroups.value = toggled(collapsedGroups.value, key)
  }

  function toggleCluster(key: string) {
    if (options.menuActive()) return
    expandedClusters.value = toggled(expandedClusters.value, key)
  }

  const filterFacets = computed(() => facetsFor(view()))

  const grouping = computed(() => {
    const axis = groupingAxis(groupBy.value)
    return { ...axis, options: axis.options.filter((o) => o.value !== options.withoutGrouping) }
  })

  const filterSwitches = computed(() =>
    switchesFor({
      showDone: filter.showDone.value,
      showOthers: filter.showOthers.value,
      showLate: filter.showLate.value,
      packedCount: view().doneCount,
      hiddenOtherCount: view().hiddenOtherCount,
      lateCount: view().lateCount,
    }).filter((reveal) => reveals.has(reveal.key)),
  )

  function onToggleSwitch(key: string) {
    if (key === SWITCH_KEYS.done) filter.showDone.value = !filter.showDone.value
    else if (key === SWITCH_KEYS.late) filter.showLate.value = !filter.showLate.value
    else if (key === SWITCH_KEYS.others) filter.showOthers.value = !filter.showOthers.value
  }

  const activeChips = computed(() => chipsFor(view(), filter.facets.value))

  const visibleOpenRows = computed(
    () =>
      view()
        .groups.flatMap((group) => group.entries)
        .flatMap((entry) => (entry.kind === 'item' ? [entry] : entry.children))
        .filter((row) => !row.done).length,
  )

  // Rows on both sides (FR-25.22): the sentence counts *Sachen* behind the
  // filter, and counting the list's open **units** on the left-hand side would
  // have a single open row of quantity three report two hidden things on a
  // list hiding nothing.
  const hiddenOpenCount = computed(() => Math.max(view().openRowCount - visibleOpenRows.value, 0))

  const emptyReason = computed(() =>
    emptyReasonFor(view(), search.term.value, hiddenOpenCount.value),
  )

  const searching = computed(() => search.term.value.trim() !== '')

  /**
   * FR-25.11e: a reset that leaves part of the narrowing behind re-renders
   * the same empty screen, so this clears all of it — search, facets and
   * every reveal switch the list offers.
   */
  function resetNarrowing() {
    search.term.value = ''
    search.isOpen.value = false
    filter.reset()
    if (reveals.has(SWITCH_KEYS.others)) filter.showOthers.value = true
  }

  return {
    collapsedGroups,
    expandedClusters,
    groupBy,
    allFolded,
    toggleFoldAll,
    toggleGroup,
    toggleCluster,
    filterFacets,
    grouping,
    filterSwitches,
    onToggleSwitch,
    activeChips,
    hiddenOpenCount,
    emptyReason,
    searching,
    resetNarrowing,
  }
}

/** The list with `key` taken out if it is in, put in if it is not. */
function toggled(keys: readonly string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
}
