/**
 * M2's segmented status filter, and the one way another screen can ask for it.
 *
 * It lives beside the list rather than inside it because a second screen names
 * the same value: after a backup restore M18 sends the user here, and every
 * restored trip is *planning* (FR-18.4) — landing on the default *Active*
 * segment showed "No active trips" directly after a successful restore, which
 * reads as "nothing was imported". The filter name travels as a route query, so
 * the two screens share one vocabulary instead of two string literals.
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
