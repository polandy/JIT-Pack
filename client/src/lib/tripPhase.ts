/**
 * Where a trip stands, as the kernel's own question.
 *
 * It lives here rather than beside the other trip predicates in
 * `domain/trips.ts` because both sides of the feature-module boundary ask it
 * (FR-30.3, ADR-066): the packing list decides what its ⋮ offers, and the
 * shopping module decides which list it opens on. A module cannot import
 * `domain/`, and the alternative — each side reading the column its own way —
 * is how two screens come to disagree about the same trip.
 */
import { TRIP_STATUS_PLANNING } from '@/types/domain'

/**
 * Whether the packing has been declared finished (FR-5.10).
 *
 * The *stamp*, never „nothing is open": the list stays open afterwards so a
 * thing that was packed but never listed can still be added, and a derived
 * reading would be revoked by exactly that row.
 */
export function isPackingClosed(trip: { packing_closed_at: string | null } | null | undefined) {
  return (trip?.packing_closed_at ?? null) !== null
}

/**
 * hasDeparted: the trip's first day has come (FR-7.14). A trip with no start
 * date has no day to have passed.
 *
 * `today` is the reader's local `YYYY-MM-DD`, compared as a string: the ISO
 * day orders the way the calendar does.
 */
export function hasDeparted(trip: { start_date: string | null }, today: string): boolean {
  return trip.start_date !== null && trip.start_date.slice(0, 10) <= today
}

/** The three facts {@link beforeIsOver} reads, in the shape both sides hold them. */
export interface TripStanding {
  /** Still `planning` — nobody has tapped *Reise starten*. */
  planned: boolean
  packingClosed: boolean
  startDate: string | null
}

/** The standing of a trip row. */
export function standingOf(trip: {
  status: string
  start_date: string | null
  packing_closed_at: string | null
}): TripStanding {
  return {
    planned: trip.status === TRIP_STATUS_PLANNING,
    packingClosed: isPackingClosed(trip),
    startDate: trip.start_date,
  }
}

/**
 * beforeIsOver: *Vor der Reise* takes nothing new (FR-7.14, FR-30.8) — the
 * trip has been started, its first day has come, or its packing is finished
 * (FR-7.12). Any one is enough: a trip started a day early is under way, and
 * so is one whose date has come while nobody tapped *Reise starten*.
 *
 * M25 and M6 both ask this, and so does the dashboard card, so a task and a
 * purchase cannot land on different sides of the same moment.
 */
export function beforeIsOver(trip: TripStanding, today: string): boolean {
  return !trip.planned || trip.packingClosed || hasDeparted({ start_date: trip.startDate }, today)
}
