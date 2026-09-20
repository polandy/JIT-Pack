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

import { isPackingClosed } from '../tripPhase'

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
