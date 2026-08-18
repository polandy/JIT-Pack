import { TRIP_STATUS_ARCHIVED, type Trip } from '@/types/domain'

/**
 * What a trip *is* in time: how it sorts (FR-2.1b), and whether it is past —
 * which is what decides whether its groups still speak for it (FR-27.4).
 *
 * A trip requires nothing but its year, so every chronological sort needs
 * a key that survives a missing date instead of comparing `undefined` —
 * which sorted "Samedan 2027" wherever the engine happened to put it.
 */
export interface TripWhen {
  year: number
  start_date: string | null
  end_date: string | null
}

/**
 * An ISO-shaped, lexically sortable key: the start date where there is
 * one, else the end date, else the year alone.
 *
 * A year-only trip lands at the *start* of its year, so in M2's
 * newest-first list it follows that year's dated trips. Any position
 * inside the year would be defensible; what matters is that it is
 * predictable rather than whatever order the engine happened to produce
 * when the key was `undefined`.
 */
export function tripOrderKey(trip: TripWhen): string {
  return trip.start_date ?? trip.end_date ?? `${trip.year}-00-00`
}

/**
 * followsGroups answers the one question FR-27.4 turns on: does this trip
 * still listen to the groups it was generated from?
 *
 * A trip stops listening when it is **past** — archived, or its end date
 * gone by. Everything else listens, a running trip included: the owner's
 * rule (2026-08-18) is that departure does not freeze a trip, it only
 * decides that the change is *asked about* rather than taken silently.
 *
 * `today` is passed in rather than read from the clock, so the boundary is
 * a value a test can stand on either side of.
 */
export function followsGroups(trip: Trip, today: string): boolean {
  if (trip.status === TRIP_STATUS_ARCHIVED) return false
  // An absent end date decides nothing — a trip without one is open-ended,
  // not over. Both sides are ISO `YYYY-MM-DD`, where string order is date
  // order; the last day still counts, the trip is over when the day is.
  return trip.end_date === null || trip.end_date >= today
}
