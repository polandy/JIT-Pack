import { describe, expect, it } from 'vitest'
import { centsAsInput, parseCents } from '../currency'

describe('parseCents', () => {
  it.each([
    ['12.5', 1250],
    ['0.1', 10],
    // Rounded, not truncated: 19.99 * 100 is 1998.9999… in floating point.
    ['19.99', 1999],
    ['3', 300],
    ['', null],
    ['abc', null],
  ])('reads %j as %j', (input, cents) => {
    expect(parseCents(input)).toBe(cents)
  })
})

describe('centsAsInput', () => {
  it.each([
    [1250, '12.50'],
    [5, '0.05'],
    [null, ''],
    [0, ''],
  ])('shows %j as %j', (cents, text) => {
    expect(centsAsInput(cents)).toBe(text)
  })

  it('round-trips through parseCents', () => {
    expect(parseCents(centsAsInput(1999))).toBe(1999)
  })
})
