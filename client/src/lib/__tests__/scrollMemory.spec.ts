import { beforeEach, describe, expect, it } from 'vitest'

import { peekScroll, rememberScroll, takeScroll } from '../scrollMemory'

/**
 * The seam behind M4's scroll restoration (ADR-012's overlay amendment).
 * Its whole reason for existing is that the position must outlive the
 * component, so the cases are about the memory rather than about scrolling.
 */
describe('scrollMemory', () => {
  const TRIP = 'trip-1'
  const OTHER = 'trip-2'
  const AT_ROW_20 = { top: 515, headerCollapsed: true }

  beforeEach(() => {
    takeScroll(TRIP)
    takeScroll(OTHER)
  })

  it('remembers a position per key', () => {
    rememberScroll(TRIP, AT_ROW_20)
    rememberScroll(OTHER, { top: 17, headerCollapsed: false })

    expect(peekScroll(TRIP)).toEqual(AT_ROW_20)
    expect(peekScroll(OTHER)).toEqual({ top: 17, headerCollapsed: false })
  })

  it('reports nothing for a key that was never written', () => {
    expect(peekScroll('unknown')).toBeUndefined()
  })

  it('peeking leaves the position in place, so a still-open overlay can restore again', () => {
    rememberScroll(TRIP, AT_ROW_20)

    expect(peekScroll(TRIP)).toEqual(AT_ROW_20)
    expect(peekScroll(TRIP)).toEqual(AT_ROW_20)
  })

  it('taking forgets it, so a later entry does not inherit a stale position', () => {
    rememberScroll(TRIP, AT_ROW_20)

    expect(takeScroll(TRIP)).toEqual(AT_ROW_20)
    expect(peekScroll(TRIP)).toBeUndefined()
    expect(takeScroll(TRIP)).toBeUndefined()
  })

  it('carries the header state, because the offset alone names different rows', () => {
    rememberScroll(TRIP, { top: 515, headerCollapsed: true })

    expect(takeScroll(TRIP)?.headerCollapsed).toBe(true)
  })
})
