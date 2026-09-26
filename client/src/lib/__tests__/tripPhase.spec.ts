/**
 * FR-5.10's one fact, asked by both sides of the module boundary (FR-30.3).
 *
 * It is three lines, and it is pinned because of the answer nobody would
 * think to write down: a trip that is **not here yet** is not a closed one.
 * M6 asks this before the trip has arrived on a cold start, and a predicate
 * that threw or answered *true* there would open a planned trip at the
 * destination and then move the tab under the reader (ADR-033's failure).
 */
import { describe, it, expect } from 'vitest'

import { beforeIsOver, hasDeparted, isPackingClosed, standingOf } from '../tripPhase'

describe('isPackingClosed', () => {
  it('is the stamp, not a reading of the rows', () => {
    expect(isPackingClosed({ packing_closed_at: '2026-09-20T18:40:00.000Z' })).toBe(true)
    expect(isPackingClosed({ packing_closed_at: null })).toBe(false)
  })

  it('answers no for a trip that is not on the device', () => {
    expect(isPackingClosed(undefined)).toBe(false)
    expect(isPackingClosed(null)).toBe(false)
  })
})

describe('hasDeparted (FR-7.14): from the day of departure on', () => {
  const trip = { start_date: '2026-10-12' }
  it.each([
    ['the day before', '2026-10-11', false],
    ['the day of departure', '2026-10-12', true],
    ['on the road', '2026-10-14', true],
    ['after the trip', '2026-10-20', true],
  ] as const)('%s', (_name, today, want) => {
    expect(hasDeparted(trip, today)).toBe(want)
  })

  it('a trip with no start date has not departed: there is no day to have passed', () => {
    expect(hasDeparted({ start_date: null }, '2026-10-14')).toBe(false)
  })
})

/*
 * FR-7.14/FR-30.8: *Vor der Reise* takes nothing new once the trip is under
 * way — and "under way" is one answer for M25 and M6. Each fact alone is
 * enough; the case that used to split the two screens is each one alone.
 */
describe('beforeIsOver', () => {
  const ahead = { planned: true, packingClosed: false, startDate: '2026-10-12' }
  it.each([
    ['a planned trip ahead of its start', ahead, false],
    ['a planned trip with no start date', { ...ahead, startDate: null }, false],
    ['a trip started early by Reise starten', { ...ahead, planned: false }, true],
    ['a planned trip whose first day has come', { ...ahead, startDate: '2026-10-10' }, true],
    ['a planned trip whose packing is finished', { ...ahead, packingClosed: true }, true],
  ] as const)('%s', (_name, trip, want) => {
    expect(beforeIsOver(trip, '2026-10-10')).toBe(want)
  })

  it('reads a trip row: status, start date and the packing stamp', () => {
    expect(
      standingOf({ status: 'active', start_date: null, packing_closed_at: '2026-10-09T18:00:00Z' }),
    ).toEqual({ planned: false, packingClosed: true, startDate: null })
    expect(
      standingOf({ status: 'planning', start_date: '2026-10-12', packing_closed_at: null }),
    ).toEqual({ planned: true, packingClosed: false, startDate: '2026-10-12' })
  })
})
