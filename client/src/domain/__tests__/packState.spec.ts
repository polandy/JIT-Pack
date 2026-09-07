/**
 * C-4 (design review 2026-09-02): the packing state derived from a row's
 * numbers, once. The table pins what the five former copies answered where
 * they agreed, and decides the two cells where they did not — a quantity of
 * 0 is FR-5.5's skipped row, never `packed` and never `open`.
 */
import { describe, expect, it } from 'vitest'

import { isFullyPacked, isPartlyPacked, stateFor, unitsOf } from '../packState'

describe('stateFor (FR-25.2, FR-25.13f, FR-5.5)', () => {
  it.each([
    // packed, quantity, expected — the ordinary rows every copy agreed on
    [0, 1, 'open'],
    [1, 1, 'packed'],
    [0, 3, 'open'],
    [1, 3, 'partial'],
    [2, 3, 'partial'],
    [3, 3, 'packed'],
    // a count that overshot reads as packed, not as a surplus
    [4, 3, 'packed'],
    // a negative count is a corrupt row, not a partial one
    [-1, 3, 'open'],
    // the cell two copies got wrong: quantity 0 is the skipped row (FR-5.5).
    // `incrementPacked` clamped to 0 and read `0 >= 0` as packed;
    // `releasePackingNow` did the same; the dashboard checkbox ticked it.
    [0, 0, 'skipped'],
    [1, 0, 'skipped'],
    [0, -2, 'skipped'],
  ] as const)('packed %i of %i → %s', (packed, quantity, expected) => {
    expect(stateFor(packed, quantity)).toBe(expected)
  })
})

describe('the two checkbox readings', () => {
  it('fully packed is packed, and a skipped row is not it', () => {
    expect(isFullyPacked({ packed_count: 2, quantity: 2 })).toBe(true)
    expect(isFullyPacked({ packed_count: 1, quantity: 2 })).toBe(false)
    expect(isFullyPacked({ packed_count: 0, quantity: 0 })).toBe(false)
  })

  it('partly packed is strictly between nothing and everything', () => {
    expect(isPartlyPacked({ packed_count: 1, quantity: 3 })).toBe(true)
    expect(isPartlyPacked({ packed_count: 0, quantity: 3 })).toBe(false)
    expect(isPartlyPacked({ packed_count: 3, quantity: 3 })).toBe(false)
    expect(isPartlyPacked({ packed_count: 0, quantity: 0 })).toBe(false)
  })
})

describe('unitsOf (FR-25.22) — what a row contributes to the fractions above it', () => {
  it.each([
    ['nothing packed', 0, 3, { done: 0, total: 3 }],
    ['part packed — the case that used to count as zero', 1, 2, { done: 1, total: 2 }],
    ['fully packed', 4, 4, { done: 4, total: 4 }],
    ['overshot by two devices, clamped to the quantity', 5, 3, { done: 3, total: 3 }],
    ['a negative count is still no units', -1, 2, { done: 0, total: 2 }],
  ] as const)('%s', (_name, packed_count, quantity, expected) => {
    expect(unitsOf({ packed_count, quantity })).toEqual(expected)
  })

  it('a skipped row counts as one unit, done — never 0/0 (FR-5.5)', () => {
    expect(unitsOf({ packed_count: 0, quantity: 0 })).toEqual({ done: 1, total: 1 })
    expect(unitsOf({ packed_count: 0, quantity: -2 })).toEqual({ done: 1, total: 1 })
  })

  it('is a total, so the fractions above a row compose by adding', () => {
    const rows = [
      { packed_count: 1, quantity: 2 },
      { packed_count: 0, quantity: 3 },
      { packed_count: 0, quantity: 0 },
    ]
    const sum = rows
      .map(unitsOf)
      .reduce((a, b) => ({ done: a.done + b.done, total: a.total + b.total }))
    expect(sum).toEqual({ done: 2, total: 6 })
  })
})
