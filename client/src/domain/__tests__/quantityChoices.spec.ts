/**
 * FR-25.24: the quick amounts the quantity editor offers, and the bounds it
 * writes inside. The two computed chips are the trip's own arithmetic, so
 * the table pins what each of them does when the trip cannot answer —
 * no dates, one traveler, a per-person row.
 */
import { describe, expect, it } from 'vitest'

import { QUANTITY_MAX, QUANTITY_MIN, clampQuantity, quantityChoices } from '../quantityChoices'

describe('clampQuantity (FR-25.24)', () => {
  it.each([
    // raw, expected
    [3, 3],
    [1, 1],
    // FR-5.5's zero belongs to the skip control, never to the editor
    [0, QUANTITY_MIN],
    [-4, QUANTITY_MIN],
    // a typo bound, not a database one
    [100, QUANTITY_MAX],
    [1e6, QUANTITY_MAX],
    // a fraction is floored rather than rounded: 2.9 shirts is 2 shirts
    [2.9, 2],
    // an empty numeric field parses to NaN mid-typing
    [Number.NaN, QUANTITY_MIN],
    [Number.POSITIVE_INFINITY, QUANTITY_MAX],
  ])('clamps %p to %p', (raw, expected) => {
    expect(clampQuantity(raw)).toBe(expected)
  })
})

describe('quantityChoices (FR-25.24)', () => {
  const base = { durationDays: null, travelerCount: 1, perPerson: false }

  it('offers the fixed amounts when the trip can say nothing else', () => {
    expect(quantityChoices(base)).toEqual([
      { kind: 'plain', value: 1 },
      { kind: 'plain', value: 2 },
      { kind: 'plain', value: 3 },
      { kind: 'plain', value: 5 },
    ])
  })

  it('adds one per day for a trip with dates', () => {
    const choices = quantityChoices({ ...base, durationDays: 7 })
    expect(choices).toContainEqual({ kind: 'days', value: 7 })
  })

  it('adds one each for a trip with several travelers', () => {
    const choices = quantityChoices({ ...base, travelerCount: 4 })
    expect(choices).toContainEqual({ kind: 'travelers', value: 4 })
  })

  it('offers no per-traveler amount on a per-person row (FR-25.1)', () => {
    // The row already *is* one traveler's share, so "one each" would
    // multiply a number that is not a total.
    const choices = quantityChoices({ ...base, travelerCount: 4, perPerson: true })
    expect(choices.every((choice) => choice.kind !== 'travelers')).toBe(true)
  })

  it.each([
    ['a trip of one day', { durationDays: 1 }, 'days'],
    ['a solo trip', { travelerCount: 1 }, 'travelers'],
    ['a trip with no dates', { durationDays: null }, 'days'],
  ] as const)('drops the computed amount for %s', (_name, patch, kind) => {
    const choices = quantityChoices({ ...base, ...patch })
    expect(choices.every((choice) => choice.kind !== kind)).toBe(true)
  })

  it('drops a computed amount the fixed ones already offer', () => {
    // Three travelers and the "3" chip write the same number; two chips
    // that do the same thing make the reader look for the difference.
    const choices = quantityChoices({ ...base, travelerCount: 3, durationDays: 3 })
    expect(choices.filter((choice) => choice.value === 3)).toEqual([{ kind: 'plain', value: 3 }])
  })

  it('keeps a computed amount inside the editor bounds', () => {
    const choices = quantityChoices({ ...base, durationDays: 400 })
    expect(choices).toContainEqual({ kind: 'days', value: QUANTITY_MAX })
  })
})
