import { describe, expect, it } from 'vitest'
import { nextHeadState } from '@/lib/headScroll'
import type { HeadScrollState, ScrollReading } from '@/lib/headScroll'

/**
 * FR-21.17. The rule reads a scroll direction, and the one case worth a
 * test is the reading it must *not* read: a collapse hands the head's
 * height to the scroll viewport, the scrollable range shortens by the same
 * amount, and the browser clamps `scrollTop` down to fit. That clamp is an
 * upward scroll to anything watching, and it re-opens the head, which
 * lengthens the range again. Measured on a 1280×900 window before the
 * guard, the head opened and shut on a single flick.
 */
describe('nextHeadState — the head yields to the list (FR-21.17)', () => {
  const standing: HeadScrollState = { top: 0, collapsed: false }
  const reading = (top: number, viewport: ScrollReading['viewport'] = null): ScrollReading => ({
    top,
    viewport,
  })

  it('yields once the list has scrolled past the head', () => {
    expect(nextHeadState(standing, reading(200)).collapsed).toBe(true)
  })

  it('comes back on an upward scroll', () => {
    const yielded = nextHeadState(standing, reading(200))

    expect(nextHeadState(yielded, reading(120)).collapsed).toBe(false)
  })

  it('stays standing near the top, where it is in nobody’s way', () => {
    expect(nextHeadState(standing, reading(40)).collapsed).toBe(false)
  })

  it('ignores the rubber-band jitter, and does not move its own baseline', () => {
    const yielded = nextHeadState(standing, reading(200))

    const jittered = nextHeadState(yielded, reading(196))

    expect(jittered).toBe(yielded)
  })

  /**
   * The clamp, and its boundary. `bottom` is the reading the browser
   * produces after the collapse; `justAbove` clears the one-pixel tolerance
   * `atBottom` allows for a fractional offset, and is a real gesture — which
   * is what stops the guard from swallowing every upward scroll at the end
   * of a long list.
   */
  it('does not read the clamp at the very bottom as a gesture', () => {
    const yielded: HeadScrollState = { top: 444, collapsed: true }
    const bottom = reading(390, { clientHeight: 844, scrollHeight: 1234 })

    const after = nextHeadState(yielded, bottom)

    expect(after.collapsed).toBe(true)
    // The offset is still taken up, so the next reading is measured
    // against where the list actually is.
    expect(after.top).toBe(390)
  })

  it('still comes back on an upward scroll clear of the bottom', () => {
    const yielded: HeadScrollState = { top: 444, collapsed: true }
    const justAbove = reading(388, { clientHeight: 844, scrollHeight: 1234 })

    expect(nextHeadState(yielded, justAbove).collapsed).toBe(false)
  })

  it('treats a scroller it has not resolved yet as not at the bottom', () => {
    const yielded: HeadScrollState = { top: 444, collapsed: true }

    expect(nextHeadState(yielded, reading(390)).collapsed).toBe(false)
  })
})
