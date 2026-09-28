/**
 * The rules behind `DateRangeField` (G-17, ADR-080): what a tap on a day does
 * to a range being picked, which months the calendar lists, and how a month is
 * laid out Monday first. Pure, so the picker's behaviour is specified here and
 * the component only renders it.
 *
 * A day is `YYYY-MM-DD` throughout and is compared as a string — ISO days sort
 * as calendar days, and nothing here needs a `Date` except the month layout,
 * which reads UTC so a day never shifts with the device's time zone.
 */

/** A range as the picker holds it; `''` is an unset side. */
export interface DayRange {
  start: string
  end: string
}

/** One month of the calendar, `month` 1–12. */
export interface CalendarMonth {
  year: number
  month: number
}

/** How far the calendar reaches around its anchor when nothing bounds it. */
export const MONTHS_BEFORE = 12
export const MONTHS_AFTER = 24
/** How many months a tap on *Frühere Monate* or *Spätere Monate* adds to an open side. */
export const MONTHS_MORE = 12

/** How many months an open side reaches from the anchor. */
export interface CalendarReach {
  before: number
  after: number
}

export const DEFAULT_REACH: CalendarReach = { before: MONTHS_BEFORE, after: MONTHS_AFTER }

/** Which side of the range the next tap sets. */
export type RangeSide = 'start' | 'end'

/** A range and the side the next tap sets, as the picker holds them. */
export interface RangePick {
  range: DayRange
  side: RangeSide
}

/**
 * A tap sets the side the picker is on, then moves it on: a start is followed
 * by its end, so two taps pick a range and the same day twice is a one-day
 * range. Choosing the end side first sets an end alone, which FR-2.1b allows.
 *
 * Neither tap can leave an end before its start (FR-2.1d): a start past the
 * end drops the end, and an end before the start becomes the new start with
 * the end still to come.
 */
export function tapDay(pick: RangePick, day: string): RangePick {
  const { start, end } = pick.range
  if (pick.side === 'end') {
    if (start !== '' && day < start) return { range: { start: day, end: '' }, side: 'end' }
    return { range: { start, end: day }, side: 'start' }
  }
  return { range: { start: day, end: end !== '' && day > end ? '' : end }, side: 'end' }
}

/** Whether a day lies outside the bounds; an empty bound is no bound. */
export function outOfBounds(day: string, min: string, max: string): boolean {
  return (min !== '' && day < min) || (max !== '' && day > max)
}

/** How a day sits in the range, for its rendering. */
export type DayRole = 'start' | 'end' | 'single' | 'inside' | null

export function dayRole(range: DayRange, day: string): DayRole {
  const { start, end } = range
  if (day === start) return end === '' || end === start ? 'single' : 'start'
  if (day === end) return 'end'
  if (start !== '' && end !== '' && day > start && day < end) return 'inside'
  return null
}

function monthOf(day: string): CalendarMonth {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) }
}

function shift(m: CalendarMonth, by: number): CalendarMonth {
  const index = m.year * 12 + (m.month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

function ordinal(m: CalendarMonth): number {
  return m.year * 12 + m.month
}

/**
 * The months the calendar lists: from the lower bound's month to the upper
 * one's, and on an open side as far as `reach` goes from the anchor — the
 * range's start, else today. An open side grows on request, so no day is out
 * of reach, only more than one tap away.
 */
export function calendarMonths(
  anchor: string,
  min: string,
  max: string,
  reach: CalendarReach = DEFAULT_REACH,
): CalendarMonth[] {
  const around = monthOf(anchor)
  let first = min !== '' ? monthOf(min) : shift(around, -reach.before)
  let last = max !== '' ? monthOf(max) : shift(around, reach.after)
  if (ordinal(first) > ordinal(last)) [first, last] = [last, first]
  const months: CalendarMonth[] = []
  for (let m = first; ordinal(m) <= ordinal(last); m = shift(m, 1)) months.push(m)
  return months
}

/** A month's days in order, and how many empty cells precede the first (Monday first). */
export function monthDays(m: CalendarMonth): { lead: number; days: string[] } {
  const firstWeekday = new Date(Date.UTC(m.year, m.month - 1, 1)).getUTCDay()
  const count = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate()
  const prefix = `${m.year}-${String(m.month).padStart(2, '0')}-`
  return {
    lead: (firstWeekday + 6) % 7,
    days: Array.from({ length: count }, (_, i) => prefix + String(i + 1).padStart(2, '0')),
  }
}

/** The key a month is found by in the rendered calendar. */
export function monthKey(m: CalendarMonth): string {
  return `${m.year}-${String(m.month).padStart(2, '0')}`
}
