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
  /** A long list unless told otherwise: one that stays scrollable after the head has yielded. */
  const reading = (
    top: number,
    viewport: ScrollReading['viewport'] = { clientHeight: 700, scrollHeight: 2000 },
  ): ScrollReading => ({ top, viewport })

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

    expect(nextHeadState(yielded, reading(390, null)).collapsed).toBe(false)
  })

  /**
   * A list only a little longer than its screen: yielding the head hands
   * the scroller enough room that nothing is left to scroll, and the clamp
   * lands at the very top. Held there, the head could never come back —
   * no gesture is possible on a list that fits — and M4's view switcher
   * was gone for good (E2E-M4-28, found by FR-7.4's taller list).
   */
  it('comes back when the clamp lands where it would never have yielded', () => {
    const yielded: HeadScrollState = { top: 60, collapsed: true }
    const fits = reading(0, { clientHeight: 900, scrollHeight: 900 })

    expect(nextHeadState(yielded, fits).collapsed).toBe(false)
  })

  /**
   * A short list, such as a search's few hits: it overflows its screen by
   * less than the head's own height, so yielding would shorten the range
   * below what the reader has scrolled, the browser would clamp, the head
   * would return and the list would jump back up — on every downward
   * swipe. Measured on M4 at 390×800: 148 px of overflow ended the flick
   * at offset 44, 248 px ended it cleanly collapsed.
   */
  it('does not yield on a list that would not survive its own yield', () => {
    const shortList = reading(148, { clientHeight: 800, scrollHeight: 948 })

    expect(nextHeadState(standing, shortList).collapsed).toBe(false)
  })

  it('yields on a list that is still scrollable after the head has gone', () => {
    const longList = reading(248, { clientHeight: 700, scrollHeight: 948 })

    expect(nextHeadState(standing, longList).collapsed).toBe(true)
  })

  it('keeps a yielded head yielded while the list keeps scrolling down', () => {
    const yielded: HeadScrollState = { top: 300, collapsed: true }
    const onwards = reading(360, { clientHeight: 700, scrollHeight: 948 })

    expect(nextHeadState(yielded, onwards).collapsed).toBe(true)
  })

  it('stays yielded when the clamp lands clear of the top', () => {
    const yielded: HeadScrollState = { top: 444, collapsed: true }
    const clamped = reading(49, { clientHeight: 844, scrollHeight: 893 })

    expect(nextHeadState(yielded, clamped).collapsed).toBe(true)
  })
})
