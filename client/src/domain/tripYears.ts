/**
 * FR-2.1b: the years a trip may carry.
 *
 * One rule, because three surfaces choose a year — M3's wizard, the clone form
 * and M22 — and a span written once per surface is the §4a shape: the day the
 * window moves, two of the three keep the old one and nothing goes red.
 */

/** How many years the picker offers, starting one before the current one. */
export const YEAR_SPAN = 6

/**
 * The offered years, oldest first: last year through four ahead.
 *
 * Last year is included because a trip is often entered after it happened —
 * a January import of December's holiday is the common case, not an edge one.
 * `thisYear` is a parameter rather than a `new Date()` inside, so the rule is
 * testable without a clock.
 */
export function tripYearChoices(thisYear: number): number[] {
  return Array.from({ length: YEAR_SPAN }, (_, index) => thisYear - 1 + index)
}
