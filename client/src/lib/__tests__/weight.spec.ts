import { describe, expect, it } from 'vitest'
import { gramsAsInput, parseGrams } from '../weight'

describe('parseGrams', () => {
  it.each([
    ['850', 850],
    ['0', 0],
    // Whole grams: the column is an integer.
    ['12.7', 12],
    ['', null],
    ['abc', null],
  ])('reads %j as %j', (input, grams) => {
    expect(parseGrams(input)).toBe(grams)
  })
})

describe('gramsAsInput', () => {
  it.each([
    [850, '850'],
    [0, '0'],
    [null, ''],
  ])('shows %j as %j', (grams, text) => {
    expect(gramsAsInput(grams)).toBe(text)
  })

  it('round-trips through parseGrams', () => {
    expect(parseGrams(gramsAsInput(1200))).toBe(1200)
  })
})
