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

import { TRIP_STATUS_ACTIVE, TRIP_STATUS_ARCHIVED } from '@/types/domain'

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
    case TRIP_STATUS_ACTIVE:
      return 'active'
    case TRIP_STATUS_ARCHIVED:
      return 'archived'
    default:
      return 'planned'
  }
}

/** How many trips each segment holds. */
export type TripFilterCounts = Record<TripFilter, number>

/**
 * Tallies trips per segment (FR-2.8), through `filterForStatus` so the count
 * and the list can never disagree about where a status belongs.
 */
export function countTripsByFilter(trips: readonly { status?: string }[]): TripFilterCounts {
  const counts: TripFilterCounts = { active: 0, planned: 0, archived: 0 }
  for (const trip of trips) counts[filterForStatus(trip.status)]++
  return counts
}

/**
 * The segment M2 opens on (FR-2.8): a segment showing nothing is left for the
 * first one that shows something, in the order the segments are in.
 *
 * Two properties are the whole point, and both are visible in the two lines:
 * a segment that still holds trips is returned unchanged — the rule fires
 * only against an empty view, so it can never take a choice away from the
 * user — and a device with no trips at all lands on the first segment, whose
 * empty state is the one offering to plan a trip (G-7), rather than on
 * whichever empty segment was last tapped.
 *
 * The caller owes the guard this cannot carry: counts taken from a list that
 * has not arrived yet are zeros, and every zero here means "leave" — see
 * `masterDataLoaded`.
 */
export function openingFilter(current: TripFilter, counts: TripFilterCounts): TripFilter {
  if (counts[current] > 0) return current
  return TRIP_FILTERS.find((filter) => counts[filter] > 0) ?? TRIP_FILTERS[0]
}
