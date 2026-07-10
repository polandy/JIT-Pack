/**
 * Formula engine (FR-1.3/FR-1.5/FR-15.3): variable catalog, ceil/floor/
 * round, validation at template save time, NULL-duration fallback
 * (FR-2.1a).
 */
import { describe, expect, it } from 'vitest'

import { evaluateFormula, validateFormula, type FormulaVariables } from '../formula'

const vars: FormulaVariables = {
  trip_duration: 10,
  num_travelers: 4,
  num_adults: 2,
  num_children: 2,
  season: 'winter',
  transport_mode: 'car',
  accommodation: 'holiday_flat',
}

describe('evaluateFormula', () => {
  it.each([
    ['1', 1],
    ['3 + 4', 7],
    ['2 * (3 + 1)', 8],
    ['trip_duration', 10],
    ['num_travelers * 2', 8],
    ['num_adults + num_children', 4],
    ['ceil(trip_duration / 3)', 4],
    ['floor(trip_duration / 3)', 3],
    ['round(trip_duration / 4)', 3],
    ['ceil(trip_duration / 7)', 2],
    ['-2 + 5', 3],
  ])('%s → %d', (src, want) => {
    expect(evaluateFormula(src, vars)).toBe(want)
  })

  it('supports attribute comparisons as 0/1 (FR-15.3)', () => {
    expect(evaluateFormula('(season == "winter") * 2 + 1', vars)).toBe(3)
    expect(evaluateFormula('(season != "winter") * 2 + 1', vars)).toBe(1)
  })

  it('falls back to null when trip_duration is null (FR-2.1a)', () => {
    const noStart = { ...vars, trip_duration: null }
    expect(evaluateFormula('ceil(trip_duration / 2)', noStart)).toBeNull()
    expect(evaluateFormula('trip_duration + 1', noStart)).toBeNull()
    // Formulas not referencing the duration are unaffected.
    expect(evaluateFormula('num_travelers', noStart)).toBe(4)
  })

  it('compares missing attributes as not-equal instead of failing', () => {
    const noSeason = { ...vars, season: null }
    expect(evaluateFormula('(season == "winter") * 2', noSeason)).toBe(0)
  })

  it('yields null on division by zero (caller falls back to 1)', () => {
    expect(evaluateFormula('5 / (num_adults - 2)', vars)).toBeNull()
  })
})

describe('validateFormula', () => {
  it.each(['1', 'ceil(trip_duration / 2)', 'num_travelers * 2 + 1', '(season == "winter") * 2'])(
    'accepts %s',
    (src) => {
      expect(validateFormula(src).ok).toBe(true)
    },
  )

  it.each([
    ['', /empty/i],
    ['2 +', /unexpected/i],
    ['bogus_var + 1', /unknown variable/i],
    ['sqrt(4)', /unknown function/i],
    ['ceil()', /argument/i],
    ['season + 2', /numeric/i],
    ['2 == 2 == 2', /comparison/i],
    ['(2 + 3', /\)/],
  ])('rejects %s', (src, pattern) => {
    expect(validateFormula(src)).toMatchObject({
      ok: false,
      error: expect.stringMatching(pattern),
    })
  })
})
