/**
 * The packing list's filter (FR-25.11) — pure, no I/O, no Vue: the facets and
 * their values, which values a row satisfies, and what the panel may offer.
 * `buildPackingView` filters with it, and the panel's chips and switches
 * (`lib/packingFilterPanel.ts`) word what it answers.
 */
import type { FacetKey, Facets, ItemMode, TripItem, Traveler, Container } from '@/types/domain'
import { ITEM_MODES } from '@/types/domain'

/**
 * What a facet reads off a row. A packing view's `PackableRow` carries it;
 * a fact a row does not have reads as none.
 */
export type FacetRow = Pick<
  TripItem,
  'id' | 'state' | 'mode' | 'category_name' | 'assigned_traveler_id'
> &
  Partial<Pick<TripItem, 'container_id' | 'late_packer' | 'flag_missing'>>

/**
 * The facets in panel order (FR-25.11b). Every value is a string so the whole
 * filter survives a `JSON.stringify` into session storage (FR-25.18).
 */
export const FACET_KEYS: readonly FacetKey[] = [
  'person',
  'category',
  'mode',
  'container',
  'flag',
  'status',
] as const

/**
 * The empty string addresses the *absence* of a value — shared items in the
 * person facet (FR-25.11f), uncategorised rows, luggage-less rows. It is a
 * value like any other, not "no selection": that is an empty array.
 */
export const NO_VALUE = ''

const MODE_VALUES: readonly ItemMode[] = ITEM_MODES

/** The *Merkmale* facet (FR-25.11b): flags that cut across the other axes. */
export const FLAG_VALUES = ['late', 'missing', 'prep'] as const
export type FlagFacetValue = (typeof FLAG_VALUES)[number]

/**
 * The *Status* facet (FR-25.11l): three buckets, not the five raw
 * {@link ItemState} values — `packing_now`/`partial` collapse into
 * `not_packed` because the owner asked "packed / skipped / not yet packed",
 * and a fourth or fifth chip would answer a question nobody asked.
 */
export const PACK_STATUS_VALUES = ['packed', 'skipped', 'not_packed'] as const
export type PackStatusFacetValue = (typeof PACK_STATUS_VALUES)[number]

export function packStatusOf(item: FacetRow): PackStatusFacetValue {
  if (item.state === 'packed') return 'packed'
  if (item.state === 'skipped') return 'skipped'
  return 'not_packed'
}

/** An unfiltered facet set — the state every fresh session starts from (FR-25.18). */
export function noFacets(): Facets {
  return { person: [], category: [], mode: [], container: [], flag: [], status: [] }
}

/** One offer in the filter sheet (FR-25.11d). */
export interface FacetValue {
  value: string
  /**
   * `null` where the wording is UI copy rather than data — modes, flags and
   * every absence bucket. Same convention as `PackingGroup.name`.
   */
  label: string | null
  /** What picking this value would yield, given the *other* active facets. */
  count: number
  selected: boolean
}

/**
 * The facet values a row satisfies — one place, so filtering and counting can
 * never drift apart. All facets but *Merkmale* answer with exactly one value.
 */
export function valuesOf(item: FacetRow, key: FacetKey, hasOpenPrep: boolean): string[] {
  switch (key) {
    case 'person':
      return [item.assigned_traveler_id ?? NO_VALUE]
    case 'category':
      return [item.category_name ?? NO_VALUE]
    case 'mode':
      return [item.mode]
    case 'container':
      return [item.container_id ?? NO_VALUE]
    case 'flag': {
      const flags: FlagFacetValue[] = []
      if (item.late_packer) flags.push('late')
      if (item.flag_missing) flags.push('missing')
      if (hasOpenPrep) flags.push('prep')
      return flags
    }
    case 'status':
      return [packStatusOf(item)]
  }
}

/**
 * FR-25.11d — what each facet may offer, and what picking it would yield.
 *
 * Counts run over **open** rows only (offering to filter for finished work
 * misleads) and against the *other* active facets but not the value's own, so
 * the numbers say what picking it would do rather than what is on screen. A
 * selected value is listed even at zero: a filter that cannot be undone from
 * inside the panel is a trap. The search term deliberately does not enter here
 * — it is a momentary lookup, not part of the filter the panel edits.
 */
export function buildFacetValues<R extends FacetRow>(ctx: {
  items: R[]
  facets: Facets
  passesFacets: (item: R, skip?: FacetKey) => boolean
  done: (item: R) => boolean
  hasOpenPrep: (item: R) => boolean
  travelerById: Map<string, Traveler>
  containerById: Map<string, Container>
}): Record<FacetKey, FacetValue[]> {
  const { items, facets, passesFacets, done, hasOpenPrep, travelerById, containerById } = ctx
  const open = items.filter((item) => !done(item))

  const result = {} as Record<FacetKey, FacetValue[]>
  for (const key of FACET_KEYS) {
    // FR-25.11l: Status is the one axis that names a done-state, so counting
    // only open rows would report zero for "gepackt"/"weggelassen" no matter
    // how many there are — the opposite of every other facet's rule.
    const candidates = key === 'status' ? items : open
    const counts = new Map<string, number>()
    for (const item of candidates) {
      if (!passesFacets(item, key)) continue
      for (const value of valuesOf(item, key, hasOpenPrep(item))) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
    }
    for (const value of facets[key]) if (!counts.has(value)) counts.set(value, 0)

    const values: FacetValue[] = [...counts.entries()].map(([value, count]) => ({
      value,
      label: labelFor(key, value, travelerById, containerById),
      count,
      selected: facets[key].includes(value),
    }))
    result[key] = sortFacetValues(key, values)
  }
  return result
}

function labelFor(
  key: FacetKey,
  value: string,
  travelerById: Map<string, Traveler>,
  containerById: Map<string, Container>,
): string | null {
  if (value === NO_VALUE) return null
  switch (key) {
    case 'person':
      return travelerById.get(value)?.name ?? null
    case 'container':
      return containerById.get(value)?.name ?? null
    case 'category':
      return value
    default:
      // Modes and flags are UI copy — the caller words them through t().
      return null
  }
}

/**
 * The absence bucket leads its facet (FR-25.11f/g): "Gemeinsam" and "kein
 * Gepäck" are the absence of a value, not one more name among the people.
 * Modes and flags keep their declared order, everything else sorts by label.
 */
function sortFacetValues(key: FacetKey, values: FacetValue[]): FacetValue[] {
  if (key === 'mode') return orderBy(values, MODE_VALUES)
  if (key === 'flag') return orderBy(values, FLAG_VALUES)
  if (key === 'status') return orderBy(values, PACK_STATUS_VALUES)
  return [...values].sort((a, b) => {
    if (a.value === NO_VALUE) return b.value === NO_VALUE ? 0 : -1
    if (b.value === NO_VALUE) return 1
    return (a.label ?? a.value).localeCompare(b.label ?? b.value)
  })
}

function orderBy(values: FacetValue[], order: readonly string[]): FacetValue[] {
  return [...values].sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value))
}
