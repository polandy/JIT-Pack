import { describe, expect, it } from 'vitest'
import { isScrollGesture, nextHeadState, SCROLLER_INPUTS } from '@/lib/headScroll'
import type { HeadScrollState, ScrollReading } from '@/lib/headScroll'

/**
 * FR-21.17. The rule reads a scroll direction, and what is worth testing is
 * every reading it must *not* read. Two of them look identical to a
 * gesture from inside a listener: the clamp a collapse provokes — the
 * scrollable range shortens by the head's height, the browser pulls
 * `scrollTop` down to fit, and the head re-opens and lengthens it again
 * (measured on a 1280×900 window: open and shut on a single flick) — and
 * every scroll nobody made, which the cases at the end of this file carry.
 */
describe('nextHeadState — the head yields to the list (FR-21.17)', () => {
  const standing: HeadScrollState = { top: 0, collapsed: false }
  /**
   * A long list unless told otherwise: one that stays scrollable after the
   * head has yielded. The reader is scrolling unless a case says otherwise,
   * because that is the only reading the rule is allowed to act on.
   */
  const reading = (
    top: number,
    viewport: ScrollReading['viewport'] = { clientHeight: 700, scrollHeight: 2000 },
  ): ScrollReading => ({ top, viewport, gesture: true })

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
   * would be gone for good (E2E-M4-28).
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

  /**
   * A scroll nobody made. The browser produces one whenever it has to bring
   * a control into view — a keyboard focus, and every click a test driver
   * aims at a row below the fold. Answering it moves every row by the head's
   * own height: measured on WebKit at 1280×600, a 60 px scroll the reader
   * did not make sent the row 162 px down the screen, which is how E2E-M5-19
   * lost a tap on a seat it had already pressed.
   */
  const unasked = (top: number, viewport?: ScrollReading['viewport']): ScrollReading => ({
    ...reading(top, viewport),
    gesture: false,
  })

  it('leaves a yielded head alone when the scroll is one nobody made', () => {
    const yielded: HeadScrollState = { top: 400, collapsed: true }

    expect(nextHeadState(yielded, unasked(340)).collapsed).toBe(true)
  })

  it('leaves a standing head alone when the scroll is one nobody made', () => {
    expect(nextHeadState(standing, unasked(300)).collapsed).toBe(false)
  })

  it('takes up the offset of a scroll nobody made, so the next gesture is measured from it', () => {
    const yielded: HeadScrollState = { top: 400, collapsed: true }

    const after = nextHeadState(yielded, unasked(340))

    expect(after.top).toBe(340)
    // Without that, an upward gesture from 340 to 300 would be read against
    // 400 — still upward, but the one after it would read as a swipe down.
    expect(nextHeadState(after, reading(300)).collapsed).toBe(false)
  })
})

/**
 * Which input means the reader is scrolling. The distinction exists because
 * the events that reach a scroller include the tap that opens a row, and the
 * scroll that follows such a tap is the browser's, not the reader's.
 */
describe('isScrollGesture (FR-21.17)', () => {
  it.each(['wheel', 'touchmove'])('reads %s as the reader scrolling', (type) => {
    expect(isScrollGesture({ type, onScroller: false })).toBe(true)
  })

  it('reads a pointer on the scroller itself as a scrollbar being dragged', () => {
    expect(isScrollGesture({ type: 'pointerdown', onScroller: true })).toBe(true)
  })

  it('does not read a pointer on a row as scrolling — it is the tap that causes the next scroll', () => {
    expect(isScrollGesture({ type: 'pointerdown', onScroller: false })).toBe(false)
  })

  it.each(['ArrowDown', 'PageUp', 'Home', ' '])('reads the %s key as paging the list', (key) => {
    expect(isScrollGesture({ type: 'keydown', key, onScroller: false })).toBe(true)
  })

  it('does not read typing as scrolling: most keys reach the list from a field inside it', () => {
    expect(isScrollGesture({ type: 'keydown', key: 'a', onScroller: false })).toBe(false)
    expect(isScrollGesture({ type: 'keydown', onScroller: false })).toBe(false)
  })

  it('does not read a plain click as scrolling', () => {
    expect(isScrollGesture({ type: 'click', onScroller: true })).toBe(false)
  })

  /**
   * The two lists have to be the same set. A type the caller listens for and
   * the rule rejects is only noise; a type the rule accepts and nobody
   * listens for is a gesture that can never arm — the head would simply stop
   * yielding, and no case here would say so.
   */
  it('counts every input its caller is told to listen for', () => {
    for (const type of SCROLLER_INPUTS) {
      expect(isScrollGesture({ type, key: 'ArrowDown', onScroller: true })).toBe(true)
    }
  })
})
