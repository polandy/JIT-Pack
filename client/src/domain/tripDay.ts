/**
 * Where a trip stands against the calendar, as the dashboard's day counter
 * reads it (FR-7.10) — pure, no I/O, no Vue.
 *
 * Whole calendar days in the reader's own zone, never a duration in hours: a
 * counter built on milliseconds says *„in 3 Tagen"* at 23:59 and *„in 2
 * Tagen"* at 00:01 by a rounding rather than by a day. Both ends of the trip
 * count, so 12–18 October is seven days.
 */

import type { TaskPhase } from '@/types/domain'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING } from '@/types/domain'

/** What the counter says; the view chooses the words. */
export type TripDay =
  /** No start date (FR-2.1b): there is nothing to count from. */
  | { kind: 'none' }
  | { kind: 'before'; daysUntil: number }
  /** The day of departure. */
  | { kind: 'first' }
  /** A day in between, or any day after the start of a trip with no end date. */
  | { kind: 'during'; day: number; total: number | null; remaining: number | null }
  | { kind: 'last' }
  | { kind: 'after' }

const MS_PER_DAY = 86_400_000

/** A `YYYY-MM-DD` date as a day number, immune to DST since it goes through UTC. */
function dayNumber(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MS_PER_DAY)
}

/** tripDay reads the calendar; `today` is the reader's local day. */
export function tripDay(
  trip: { start_date: string | null; end_date: string | null },
  today: Date,
): TripDay {
  const start = trip.start_date ? dayNumber(trip.start_date) : null
  if (start === null) return { kind: 'none' }
  const now = Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / MS_PER_DAY,
  )
  const end = trip.end_date ? dayNumber(trip.end_date) : null

  if (now < start) return { kind: 'before', daysUntil: start - now }
  if (end !== null && now > end) return { kind: 'after' }
  if (now === start) return { kind: 'first' }
  if (end !== null && now === end) return { kind: 'last' }
  return {
    kind: 'during',
    day: now - start + 1,
    total: end === null ? null : end - start + 1,
    remaining: end === null ? null : end - now,
  }
}

/**
 * taskPhaseInFront is the phase of task the dashboard leads with (FR-7.10): a
 * trip that has not started is still in *before*; once it has — and once it
 * is over, or is undated with its packing shut — what is left is for the road.
 *
 * **Since FR-7.12 a finished packing closes *before* outright**, whatever the
 * calendar says: the phase is read-only then, so the block's composer must
 * not write into it.
 */
export function taskPhaseInFront(day: TripDay, packingClosed = false): TaskPhase {
  return day.kind === 'before' && !packingClosed ? TASK_PHASE_BEFORE : TASK_PHASE_DURING
}

/**
 * hasDeparted: the trip's first day has come (FR-7.14). From then on a task
 * written on M25 is for the road — *before the trip* is behind the reader,
 * and the dashboard already leads with the road's tasks from the same day
 * ({@link taskPhaseInFront}). A trip with no start date has no day to have
 * passed, so it keeps both phases.
 *
 * `today` is the reader's local `YYYY-MM-DD`, compared as a string: the ISO
 * day orders the way the calendar does.
 */
export function hasDeparted(trip: { start_date: string | null }, today: string): boolean {
  return trip.start_date !== null && trip.start_date.slice(0, 10) <= today
}
