/**
 * What a screen's head should do as its list scrolls (FR-21.17).
 *
 * A pure step rather than a handler, because the rule it holds is not
 * obvious and has exactly one interesting case: a collapse changes the
 * scroller's own geometry, and the browser's answer to that arrives
 * looking like a gesture. That case is unreachable from a unit test as
 * long as the rule lives inside a scroll listener.
 */

/** Below this the head is never in the way, so a gesture is ignored. */
const YIELD_AFTER_PX = 48

/**
 * What yielding hands back to the scroller: the header line (96 px, 136 px
 * with two figures) and the page head above it, measured on M4 as 147 px in
 * the single-figure case. Rounded up past the taller line.
 */
const RELEASED_PX = 192

/** Smaller than a deliberate swipe: the rubber-band's own jitter. */
const NOISE_PX = 8

/** What the caller carries between readings. */
export interface HeadScrollState {
  /** The offset the last accepted reading carried. */
  top: number
  /** Whether the head is currently yielding its space to the list. */
  collapsed: boolean
}

/** One scroll reading, with the scroller's box as it stands. */
export interface ScrollReading {
  top: number
  /**
   * The scroller's own box. `null` until it has been resolved — the first
   * reading of a page arrives before `getScrollElement()` settles, and a
   * head that has never collapsed cannot be the thing clamping anything.
   */
  viewport: { clientHeight: number; scrollHeight: number } | null
}

/**
 * atBottom answers whether the scroller is sitting at its own end.
 *
 * That is where a collapse's side effect lands: handing the head's height
 * to the scroll viewport shortens the scrollable range by the same amount,
 * and the browser clamps `scrollTop` down to fit. Read back through a
 * scroll event the clamp is an upward scroll, which re-opens the head,
 * which lengthens the range again. A clamp can only ever leave the
 * scroller at the bottom, so that is where direction stops being read.
 */
function atBottom({ top, viewport }: ScrollReading): boolean {
  if (viewport === null) return false
  return top + viewport.clientHeight >= viewport.scrollHeight - 1
}

/**
 * survivesYield answers whether the list is still scrollable once the head
 * has gone. A list that overflows by less than what the yield releases
 * cannot: the range shortens below the reader's offset, the browser clamps,
 * the head returns and the list jumps back — on every downward swipe. Such a
 * list, a search's few hits for one, simply keeps its head. An unresolved
 * scroller counts as surviving: the caller resolves it at mount, so `null`
 * is a page that has not settled yet, and a head that has never collapsed
 * cannot be the thing clamping anything.
 */
function survivesYield({ viewport }: ScrollReading): boolean {
  if (viewport === null) return true
  return viewport.scrollHeight - viewport.clientHeight > YIELD_AFTER_PX + RELEASED_PX
}

/**
 * nextHeadState folds one reading into the head's state: it yields on the
 * way down and returns on any upward scroll, ignoring both the jitter at
 * the top and the clamp at the bottom.
 *
 * Except a clamp that lands within the head's own threshold: there the
 * list is barely longer than its screen, the yield itself made it fit, and
 * a head held back would stay back — a list that fits cannot be scrolled
 * up to recall it. It returns, at the price of one more yield on the next
 * downward swipe.
 */
export function nextHeadState(prev: HeadScrollState, reading: ScrollReading): HeadScrollState {
  const { top } = reading
  if (Math.abs(top - prev.top) < NOISE_PX) return prev
  const up = top < prev.top
  if (up && atBottom(reading) && top > YIELD_AFTER_PX) return { ...prev, top }
  if (!prev.collapsed && !survivesYield(reading)) return { top, collapsed: false }
  return { top, collapsed: !up && top > YIELD_AFTER_PX }
}
