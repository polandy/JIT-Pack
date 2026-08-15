/**
 * The press-and-hold gesture (M7 row menu, FR-18.2 surface): a pointer that
 * stays down and still for the hold duration fires; releasing, cancelling or
 * travelling first disarms. Unit-tested here with fake timers because this
 * is the deterministic seam for the 500 ms — a real browser hold in e2e
 * would be a timing dependency, and page.clock cannot drive Ionic's overlay
 * presentation reliably (observed: the sheet fails to attach under a faked
 * clock on a warm app, nondeterministically).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX, useLongPress } from '../useLongPress'

describe('useLongPress', () => {
  let fired: string[]

  beforeEach(() => {
    vi.useFakeTimers()
    fired = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function press() {
    return useLongPress<string>((payload) => fired.push(payload))
  }

  it('fires after the hold duration with the armed payload', () => {
    const p = press()
    p.down('makro', 10, 10)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(fired).toEqual(['makro'])
  })

  it('does not fire before the duration is over', () => {
    const p = press()
    p.down('makro', 10, 10)
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)
    expect(fired).toEqual([])
    vi.advanceTimersByTime(1)
    expect(fired).toEqual(['makro'])
  })

  it('a release disarms — a tap is not a hold', () => {
    const p = press()
    p.down('makro', 10, 10)
    p.cancel()
    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(fired).toEqual([])
  })

  it('travelling past the slop disarms — a scroll is not a hold', () => {
    const p = press()
    p.down('makro', 10, 10)
    p.move(10, 10 + LONG_PRESS_SLOP_PX + 1)
    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(fired).toEqual([])
  })

  it('jitter inside the slop stays armed — a finger is not a crosshair', () => {
    const p = press()
    p.down('makro', 10, 10)
    p.move(12, 13)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(fired).toEqual(['makro'])
  })

  it('movement before any press is ignored rather than crashing', () => {
    const p = press()
    p.move(50, 50)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(fired).toEqual([])
  })

  it('a new press re-arms with the new payload and forgets the old one', () => {
    const p = press()
    p.down('makro', 10, 10)
    vi.advanceTimersByTime(LONG_PRESS_MS / 2)
    p.down('wandern', 20, 20)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(fired).toEqual(['wandern'])
  })

  it('fires once per press, not once per elapsed interval', () => {
    const p = press()
    p.down('makro', 10, 10)
    vi.advanceTimersByTime(LONG_PRESS_MS * 3)
    expect(fired).toEqual(['makro'])
  })
})
