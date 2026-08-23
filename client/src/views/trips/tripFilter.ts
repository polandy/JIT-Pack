/**
 * M2's segmented status filter, and the one way another screen can ask for it.
 *
 * It lives beside the list rather than inside it because a second screen names
 * the same value: after a backup restore M18 sends the user here, and landing
 * on the default *Active* segment showed "No active trips" directly after a
 * successful restore, which reads as "nothing was imported". The filter name
 * travels as a route query, so the two screens share one vocabulary instead of
 * two string literals. Which segment that is stopped being a constant with
 * ADR-024: a restore gives back the status it saved, so it is derived from the
 * restored trip via `filterForStatus`.
 */

/** The segments M2 offers. `planned` is the display name of DB `planning`. */
export const TRIP_FILTERS = ['active', 'planned', 'archived'] as const

export type TripFilter = (typeof TRIP_FILTERS)[number]

/** The query parameter M2 reads its initial segment from. */
export const TRIP_FILTER_QUERY = 'status'

/**
 * parseTripFilter reads a route query value, or null when it names no segment.
 *
 * Null rather than a default, so a caller can tell "asked for nothing" from
 * "asked for something unknown" — both leave the list on whatever it already
 * shows rather than silently resetting the user's choice.
 */
export function parseTripFilter(value: unknown): TripFilter | null {
  return typeof value === 'string' && (TRIP_FILTERS as readonly string[]).includes(value)
    ? (value as TripFilter)
    : null
}

/**
 * The segment a trip of this status appears on.
 *
 * Named here rather than at the caller because the mapping is the one place
 * the DB word and the display word differ — `planning` is shown as *planned* —
 * and a second copy of that would drift. An absent status is a restore with no
 * trip in it, which keeps the historical default rather than guessing.
 */
export function filterForStatus(status: string | undefined): TripFilter {
  switch (status) {
    case 'active':
      return 'active'
    case 'archived':
      return 'archived'
    default:
      return 'planned'
  }
}
