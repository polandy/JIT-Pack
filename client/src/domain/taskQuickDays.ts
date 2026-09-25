/**
 * FR-7.14's quick days: the handful of due days a person actually picks,
 * offered as chips so the calendar is the last resort rather than the only
 * way (owner, 2026-09-25 — setting a day took five taps through two sheets).
 *
 * A day is `YYYY-MM-DD` and `today` comes from the caller, as in
 * `taskDue.ts`: no clock is read here.
 */
import type { TaskPhase } from '@/types/domain'
import { TASK_PHASE_BEFORE } from '@/types/domain'
import { daysBetween } from './taskDue'

export const QUICK_DAY_TODAY = 'today'
export const QUICK_DAY_TOMORROW = 'tomorrow'
export const QUICK_DAY_BEFORE_DEPARTURE = 'beforeDeparture'
export type QuickDayKey =
  typeof QUICK_DAY_TODAY | typeof QUICK_DAY_TOMORROW | typeof QUICK_DAY_BEFORE_DEPARTURE

/** One chip: what it is called, and the day it writes. */
export interface QuickDay {
  key: QuickDayKey
  day: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** `day` moved by `n` calendar days, counted in UTC so no DST can bend it. */
export function addDays(day: string, n: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date) + n * MS_PER_DAY).toISOString().slice(0, 10)
}

/**
 * quickDueDays lists the chips for a task in `phase` on a trip leaving on
 * `tripStart`.
 *
 * *Heute* and *Morgen* always. *Vor Abreise* — the day before departure —
 * only for a task meant for before the trip (a task for the road is not due
 * before it starts), only where the trip names a start, and only when that
 * day is later than tomorrow: earlier, it would be one of the other two chips
 * under a second name, or a day already gone. `phase` is null where the tasks
 * in hand are of both phases (a mixed selection), which offers none.
 */
export function quickDueDays(
  today: string,
  opts: { phase: TaskPhase | null; tripStart: string | null },
): QuickDay[] {
  const days: QuickDay[] = [
    { key: QUICK_DAY_TODAY, day: today },
    { key: QUICK_DAY_TOMORROW, day: addDays(today, 1) },
  ]
  if (opts.phase === TASK_PHASE_BEFORE && opts.tripStart) {
    const eve = addDays(opts.tripStart, -1)
    if (daysBetween(today, eve) > 1) days.push({ key: QUICK_DAY_BEFORE_DEPARTURE, day: eve })
  }
  return days
}
