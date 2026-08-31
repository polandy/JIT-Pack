/** FR-2.1b — the one year rule the three year pickers share. */
import { describe, it, expect } from 'vitest'

import { tripYearChoices, YEAR_SPAN } from '../tripYears'

describe('tripYearChoices (FR-2.1b)', () => {
  it('offers last year first and four ahead', () => {
    expect(tripYearChoices(2026)).toEqual([2025, 2026, 2027, 2028, 2029, 2030])
  })

  it('always offers the current year, which is what a picker defaults to', () => {
    expect(tripYearChoices(2026)).toContain(2026)
  })

  it('offers exactly YEAR_SPAN years', () => {
    expect(tripYearChoices(1999)).toHaveLength(YEAR_SPAN)
  })

  /**
   * Last year is offered on purpose: a trip is often entered after it
   * happened, and a picker starting at the current year would make January's
   * entry of December's holiday impossible without the import path.
   */
  it('reaches into the past by exactly one year', () => {
    expect(Math.min(...tripYearChoices(2026))).toBe(2025)
  })
})
