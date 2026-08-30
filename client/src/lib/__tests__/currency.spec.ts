// @vitest-environment jsdom
/**
 * FR-21.9 — the instance names the currency its amounts are in.
 *
 * The subject touches `localStorage` and `fetch`, so the DOM environment is
 * declared rather than inherited. Two rules carry the feature:
 *
 * - **A label, never a conversion.** The stored `value_cents` is already in
 *   this currency; naming one changes how it reads and never what it is.
 * - **The last known code survives an offline start.** The code arrives from
 *   the server, and a device that starts in a tunnel would otherwise drop
 *   every amount back to unit-less until it reconnects.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { currentCurrency, initCurrency, setCurrency, CURRENCY_STORAGE_KEY } from '../currency'
import { formatValue } from '../format'

describe('the instance currency', () => {
  beforeEach(() => {
    localStorage.clear()
    setCurrency(null)
  })

  it('leaves an amount unit-less while no currency is named', () => {
    expect(formatValue(125000)).not.toMatch(/[A-Z]{3}|[€$£]/)
    expect(formatValue(125000)).toContain('1')
  })

  it('labels the amount once a currency is named', () => {
    setCurrency('CHF')
    expect(formatValue(125000)).toMatch(/CHF/)
  })

  it('does not convert — the same cents render as the same number', () => {
    setCurrency('CHF')
    const withChf = formatValue(125000).replace(/[^\d]/g, '')
    setCurrency('EUR')
    const withEur = formatValue(125000).replace(/[^\d]/g, '')
    expect(withChf).toBe(withEur)
  })

  it('remembers the code across a start, so an offline device keeps its labels', () => {
    // Two halves, asserted separately: naming a currency writes it down…
    setCurrency('CHF')
    expect(localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe('CHF')

    // …and a start that never reaches the server reads it back. The session
    // value is cleared first, then storage is restored to what the previous
    // start had left there, because clearing does both.
    setCurrency(null)
    localStorage.setItem(CURRENCY_STORAGE_KEY, 'CHF')
    expect(currentCurrency()).toBeNull()

    initCurrency()

    expect(currentCurrency()).toBe('CHF')
    expect(formatValue(125000)).toMatch(/CHF/)
  })

  it('forgets the code when the instance stops naming one', () => {
    setCurrency('CHF')
    setCurrency('')
    expect(currentCurrency()).toBeNull()
    expect(localStorage.getItem(CURRENCY_STORAGE_KEY)).toBeNull()
  })

  it('refuses a stored value that is not an ISO-4217 code', () => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, '€')
    initCurrency()
    expect(currentCurrency()).toBeNull()
  })

  it('survives storage that throws, without losing the session value', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode')
    })
    setCurrency('GBP')
    expect(currentCurrency()).toBe('GBP')
    spy.mockRestore()
  })
})
