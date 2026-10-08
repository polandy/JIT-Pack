/**
 * Calendar days, read and stepped — the one arithmetic every feature that
 * shows a day uses (ADR-008's „one of each"): the tasks' due days, the
 * shopping list, the day plan, the meal plan, the excursions.
 *
 * A day is `YYYY-MM-DD`, never a moment. It goes through UTC midnight, so no
 * time zone and no clock change can bend it into a neighbour, and nothing
 * here reads a clock: „today" is the caller's.
 */

/** The length of a calendar day in milliseconds, as UTC counts it. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000

/** A calendar day as UTC midnight. */
function utcDay(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  return Date.UTC(year, month - 1, date)
}

/** `day` moved by `n` calendar days; a negative `n` steps back. */
export function addDays(day: string, n: number): string {
  return new Date(utcDay(day) + n * MS_PER_DAY).toISOString().slice(0, 10)
}

/** The days from `from` to `to`; negative when `to` lies before it. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / MS_PER_DAY)
}

/**
 * Every day from `start` to `end`, both included and in order — empty without
 * either, or with the end before the start. At most `max` days, so a mistyped
 * year cannot draw ten thousand of them.
 */
export function daysOf(start: string | null, end: string | null, max: number): string[] {
  if (!start || !end || end < start) return []
  const days: string[] = []
  for (let day = start; day <= end && days.length < max; day = addDays(day, 1)) days.push(day)
  return days
}
