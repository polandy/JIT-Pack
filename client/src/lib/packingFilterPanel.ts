/**
 * M4's filter panel, worded and counted — the view model between
 * `buildPackingView` and the dumb `FilterSheet` (FR-25.11).
 *
 * `FilterSheet` takes its facets already labelled because the wording of a
 * bucket is the screen's vocabulary, not the sheet's (FR-25.11g); the
 * `PackingView` labels only what is data and leaves every absence bucket
 * `null` for the same reason. This module is where those two halves meet,
 * and it was seven computeds inside a 2700-line view — the only way to
 * reach "Gemeinsam is what an empty person value is called" was to render
 * M4 and open a sheet.
 *
 * It lives in `lib/` rather than `domain/` because it reads the catalogue,
 * and `domain/` must not import the i18n layer — the same cut `rowFacts`
 * was given.
 */
import { briefcaseOutline, cartOutline, contrastOutline, flagOutline } from 'ionicons/icons'
import { personOutline, pricetagOutline } from 'ionicons/icons'

import type {
  FilterFacet,
  FilterOption,
  FilterSwitch,
  GroupingOption,
} from '@/components/global/FilterSheet.vue'
import { FACET_KEYS, NO_VALUE } from '@/domain/packingView'
import type { FlagFacetValue, PackingView } from '@/domain/packingView'
import { t, type MessageKey } from '@/i18n'
import { modeLabel } from '@/lib/modeLabels'
import type { FacetKey, Facets, GroupBy } from '@/types/domain'

/** The five axes M4 offers, each named once. */
export const FACET_LABELS: Record<FacetKey, MessageKey> = {
  person: 'facet.person',
  category: 'facet.category',
  mode: 'facet.mode',
  container: 'facet.container',
  flag: 'facet.flag',
}

/** One glyph per axis, so the panel is scannable before it is read. */
export const FACET_ICONS: Record<FacetKey, string> = {
  person: personOutline,
  category: pricetagOutline,
  mode: cartOutline,
  container: briefcaseOutline,
  flag: flagOutline,
}

const GROUP_ICONS: Record<GroupBy, string> = {
  category: pricetagOutline,
  person: personOutline,
  container: briefcaseOutline,
  status: contrastOutline,
}

const FLAG_LABELS: Record<FlagFacetValue, MessageKey> = {
  late: 'facet.flagLate',
  missing: 'facet.flagMissing',
  prep: 'facet.flagPrep',
}

/** The grouping axis, in the order the segment offers it. */
const GROUPINGS: readonly GroupBy[] = ['category', 'person', 'container', 'status']

/**
 * The wording of one offer. Everything the view model labelled is data and
 * passes through; everything it left `null` is UI copy and is worded here —
 * the absence buckets above all. "Gemeinsam" rather than "Alle": an option
 * labelled *all* reads as *select everything* rather than *the shared items*.
 */
export function optionLabel(key: FacetKey, value: string, label: string | null): string {
  if (label !== null) return label
  if (value === NO_VALUE) {
    if (key === 'person') return t('facet.shared')
    if (key === 'container') return t('facet.noLuggage')
    return t('facet.noCategory')
  }
  if (key === 'mode') return modeLabel(value)
  if (key === 'flag') return t(FLAG_LABELS[value as FlagFacetValue])
  return value
}

/** The sheet's facets — an axis with nothing to offer is not shown at all. */
export function filterFacets(view: PackingView): FilterFacet[] {
  return FACET_KEYS.map((key) => ({
    key,
    label: t(FACET_LABELS[key]),
    icon: FACET_ICONS[key],
    options: view.facetValues[key].map<FilterOption>((value) => ({
      value: value.value,
      label: optionLabel(key, value.value, value.label),
      count: value.count,
      selected: value.selected,
    })),
  })).filter((facet) => facet.options.length > 0)
}

/** What the two reveal switches currently say about themselves. */
export interface SwitchState {
  showDone: boolean
  showOthers: boolean
  /** How many of the trip's items are packed — the Erledigte switch's count. */
  packedCount: number
  /** FR-25.20's count: rows hidden because they are somebody else's. */
  hiddenOtherCount: number
}

/** Both switches hide a class of rows, so they render from one shape. */
export function filterSwitches(state: SwitchState): FilterSwitch[] {
  return [
    {
      key: 'done',
      label: t('filter.doneLabel'),
      hint: t('filter.doneHint'),
      on: state.showDone,
      count: state.packedCount,
    },
    {
      key: 'others',
      label: t('filter.othersLabel'),
      hint: t('filter.othersHint'),
      on: state.showOthers,
      count: state.hiddenOtherCount,
    },
  ]
}

/** The grouping axis in the shape `FilterSheet` takes it. */
export function groupingAxis(groupBy: GroupBy): { value: string; options: GroupingOption[] } {
  return {
    value: groupBy,
    options: GROUPINGS.map((value) => ({
      value,
      label: t(`group.${value}` as const),
      icon: GROUP_ICONS[value],
    })),
  }
}

/** One active facet value, named by both its axis and itself. */
export interface ActiveChip {
  key: FacetKey
  value: string
  facetLabel: string
  label: string
}

/** The chip row (FR-25.11a): an active filter must never be invisible. */
export function activeChips(view: PackingView, facets: Facets): ActiveChip[] {
  return FACET_KEYS.flatMap((key) =>
    facets[key].map((value) => ({
      key,
      value,
      facetLabel: t(FACET_LABELS[key]),
      label: optionLabel(
        key,
        value,
        view.facetValues[key].find((option) => option.value === value)?.label ?? null,
      ),
    })),
  )
}

/**
 * FR-25.20's hiding is not a filter anybody set, so it must not be
 * reported as one. Reachable since FR-25.19 gave the assignment a writer:
 * a list whose rows are all somebody else's said "no matches · 1 open item
 * is behind the filter" and offered to clear a search and facets that were
 * never there.
 */
export function onlyOthersHidden(view: PackingView, search: string): boolean {
  return search.trim() === '' && view.activeFacetCount === 0 && view.hiddenOtherCount > 0
}

/**
 * Why the list is empty (FR-25.11e), in the reader's own terms: what they
 * typed, what they picked, or the rows they never asked to hide.
 */
export function emptyReason(view: PackingView, search: string, hiddenOpenCount: number): string {
  const term = search.trim()
  if (term && view.activeFacetCount > 0) return t('packing.noMatchesBoth', { term })
  if (term) return t('packing.noMatchesSearch', { term })
  if (onlyOthersHidden(view, search))
    return t('packing.emptyOthers', {
      n: view.hiddenOtherCount,
      who: view.hiddenOtherNames.join(' · '),
    })
  return t('packing.noMatchesFilter', { n: hiddenOpenCount })
}
