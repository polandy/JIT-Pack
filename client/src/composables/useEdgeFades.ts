/**
 * The one rule for a row that scrolls sideways (G-13, ADR-051 amendment 5):
 * it fades out on each side that has more, a swipe comes to rest on a whole
 * item, and the item you stand on is scrolled to the row's centre. A chip or
 * pill cut at a hard edge reads as a layout bug, not as "there is more".
 *
 * The look is `edgeFades.css` (`jp-edge-fades` plus the two `more-*`
 * classes this reads out); the trip switcher, `ChipRow`'s scrolling mode and
 * the for-whom line all draw it from there, so no screen draws its own.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref, type WatchSource } from 'vue'

/** Under a pixel of scroll left is none: a fractional width leaves a sliver nobody can scroll to. */
const EDGE_SLACK_PX = 1

export interface EdgeFadesOptions {
  /** The item to keep centred, matched inside the row — none for a row with no current item. */
  current?: string
  /** What changes the current item or the items under a mounted row; a change re-centres. */
  recentreOn?: WatchSource
}

export function useEdgeFades(row: Ref<HTMLElement | null>, options: EdgeFadesOptions = {}) {
  /** Whether items lie beyond the row's start / end edge — each side's fade. */
  const moreStart = ref(false)
  const moreEnd = ref(false)

  function readEdges() {
    const el = row.value
    if (!el) return
    moreStart.value = el.scrollLeft > EDGE_SLACK_PX
    moreEnd.value = el.scrollLeft < el.scrollWidth - el.clientWidth - EDGE_SLACK_PX
  }

  /**
   * Scrolls the current item to the row's centre, as near as the row's ends
   * allow: centred, it shows what lies on either side, and neither neighbour
   * sits cut under a fade. The row's own scroll offset only —
   * `scrollIntoView` would move the page (or the sheet) under it too.
   */
  function centre() {
    const el = row.value
    const item = options.current ? el?.querySelector<HTMLElement>(options.current) : null
    if (el && item) {
      const bounds = el.getBoundingClientRect()
      const box = item.getBoundingClientRect()
      // Whole pixels: WebKit keeps `scrollLeft` as an integer and drops the fraction.
      el.scrollLeft += Math.round(box.left + box.width / 2 - (bounds.left + bounds.width / 2))
    }
    readEdges()
  }

  // Measured only once the row has a size: a row still hidden in a page
  // transition or a sheet not yet presented reports every box as empty, and
  // a centring then moves nothing.
  let resizes: ResizeObserver | null = null
  onMounted(() => {
    centre()
    if (row.value && typeof ResizeObserver !== 'undefined') {
      resizes = new ResizeObserver(() => centre())
      resizes.observe(row.value)
    }
  })
  onBeforeUnmount(() => resizes?.disconnect())
  // The items change under a mounted row too, and the row's own box does not
  // change with them, so its observer never fires.
  if (options.recentreOn) watch(options.recentreOn, () => void nextTick(centre))

  return { moreStart, moreEnd, readEdges, centre }
}
