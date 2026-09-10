import {
  TRIP_STATUS_ACTIVE,
  TRIP_STATUS_ARCHIVED,
  TRIP_STATUS_PLANNING,
  type Trip,
} from '@/types/domain'

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
 * localIsoDate is `YYYY-MM-DD` at `at`, in the device's own timezone.
 * `toISOString()` would answer in UTC, which puts a trip a day out for
 * anyone far enough east or west of it on the evening it ends.
 *
 * It lives beside `followsGroups` because that is what consumes it, and it
 * takes the instant rather than reading a clock so the two callers — the
 * app's orchestrator and the command line's context — can both supply their
 * own (the project forbids an ambient clock).
 */
export function localIsoDate(at: number): string {
  const d = new Date(at)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
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

/**
 * Whether the trip is in a state where its rows can be judged *unused*
 * (FR-9.3).
 *
 * A running trip and an archived one, and nothing else: a planning trip
 * has not happened, so a judgement about it means nothing. The window
 * deliberately outlasts the trip, because M14 — the first place anyone
 * sees what a flag was worth — runs on the archived trip, and FR-9.1's
 * active-only rule was true of *making* a judgement and false of
 * correcting one. (*Missing* keeps that rule; it is stamped by the FR-5.6
 * quick-add, and this predicate is not about it.)
 *
 * It lives here rather than in each screen because M4's row menu and M5's
 * toggle answer the same question, and two copies drift.
 */
export function canJudgeUnused(trip: Trip | undefined): boolean {
  return trip?.status === TRIP_STATUS_ACTIVE || trip?.status === TRIP_STATUS_ARCHIVED
}

/** The one step a trip's lifecycle offers next, or `null` at the end of it. */
export type LifecycleStep = 'start' | 'archive' | null

/**
 * FR-9.1/FR-9.2: `planning` can be started, `active` can be archived, and an
 * archived trip is done. Both M2's swipe and M4's overflow ask here — the
 * rule used to be written into each of them, so a screen could offer a step
 * the other did not.
 *
 * A trip that has not loaded offers nothing rather than the first step: an
 * absent trip is not a planning one.
 */
export function nextLifecycleStep(trip: Pick<Trip, 'status'> | undefined | null): LifecycleStep {
  if (trip?.status === TRIP_STATUS_PLANNING) return 'start'
  if (trip?.status === TRIP_STATUS_ACTIVE) return 'archive'
  return null
}

/** Whether the trip is the one being packed right now — four screens ask. */
export function isActive(trip: { status: string } | undefined | null): boolean {
  return trip?.status === TRIP_STATUS_ACTIVE
}

/**
 * A trip reduced to what the departure order needs.
 *
 * The three fields are the whole contract, so a screen hands its rows over
 * unmapped and this module keeps importing no store type.
 */
export interface PlannableTrip {
  status: string
  start_date: string | null
  name: string
}

/**
 * Soonest first; an undated trip sorts last rather than first, because
 * FR-2.1b makes the date optional — „no date yet" says the departure is
 * unknown, never that it is imminent. Name breaks the tie so the order is
 * total, and therefore the same on every device.
 */
export function byDeparture(a: PlannableTrip, b: PlannableTrip): number {
  return (
    Number(a.start_date === null) - Number(b.start_date === null) ||
    (a.start_date ?? '').localeCompare(b.start_date ?? '') ||
    a.name.localeCompare(b.name)
  )
}

/**
 * The same order over trips a caller has already chosen — M1's running ones.
 * It takes no status of its own precisely because "active" is the screen's
 * predicate and not this function's; what is shared is the *ordering*.
 *
 * M1's hero is the head of this list (FR-21.13), which is why the order had
 * to become a rule rather than stay whatever the store handed over. It was
 * IndexedDB's key order over random ids: with two active trips the screen
 * named a different one as *the* trip you are on depending on the browser,
 * and E2E-M1-09 found it by disagreeing with itself between Chromium and
 * WebKit.
 */
export function byDepartureSoonestFirst<T extends PlannableTrip>(trips: readonly T[]): T[] {
  return [...trips].sort(byDeparture)
}

/**
 * The trip a screen puts its hero on: the running one that departs soonest,
 * or nothing where none is running (FR-21.13/FR-21.15).
 *
 * M1 and M2 both ask, and they have to get the same answer — two screens
 * naming a different trip as *the* trip you are on is worse than neither
 * naming one. So the choice is a rule here rather than each screen taking
 * the head of a list it happened to sort its own way: M2 orders its segments
 * newest-first through {@link tripOrderKey}, which is a different order, and
 * its hero is deliberately not the head of what it lists.
 */
export function heroTripOf<T extends PlannableTrip>(trips: readonly T[]): T | null {
  return byDepartureSoonestFirst(trips.filter(isActive))[0] ?? null
}

/**
 * calendarDate answers whether `v` is a real calendar day in `YYYY-MM-DD`,
 * returning it unchanged, or null.
 *
 * The one field the database cannot check for us: `trips.start_date` is a
 * plain TEXT column, and the `duration_days` it feeds computes to NULL over
 * nonsense rather than refusing it. So a value that is not a date is dropped
 * at the door, exactly like an implausible `year` — an optional date the
 * document did not really state (FR-2.1a/2.1b) is a smaller loss than one
 * every screen then has to render.
 *
 * It lives here rather than in either caller because both doors into the app
 * need it: the portable document (FR-18.4) and the spreadsheet header
 * (FR-16.2). It was private to the first of them, so the second grew its own
 * weaker check and let the 30th of February through.
 */
export function calendarDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const parsed = new Date(`${v}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  // The round trip is what rejects a day the month does not have: JavaScript
  // rolls 2024-02-30 forward to March rather than saying no.
  return parsed.toISOString().slice(0, 10) === v ? v : null
}
