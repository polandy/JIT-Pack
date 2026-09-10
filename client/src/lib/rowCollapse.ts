/**
 * The height collapse a leaving packing row plays (FR-25.2's transition).
 *
 * It lives here rather than inside the screen because of the way it can
 * fail: the hook must call `done` or Vue leaves the row in the DOM for good,
 * and `transitionend` — the obvious signal — never fires when no transition
 * starts. A row on a screen that is not laid out (a hidden tab, a
 * `display: none` ancestor) is exactly that case, and it is the same trap
 * `DateField` documents for `ion-datetime`'s readiness. A pure function with
 * an element-shaped parameter is one a test can hold both ends of.
 */

/** The parts of an element this needs — small enough for a test to supply. */
export interface CollapsibleRow {
  offsetHeight: number
  style: { height: string }
  getAnimations?: () => Pick<Animation, 'finished'>[]
}

/**
 * Collapses `node` to zero height and calls `done` when the row is gone.
 *
 * `height: auto` does not animate, so the height is measured and pinned
 * before being driven to 0 — the one thing CSS alone cannot express here.
 * `done` is then owed by whatever actually happens: the animations that
 * started, or, when none did, the caller's next tick. Reduced motion
 * finishes immediately, which removes the row on the next frame exactly as
 * it did before the transition existed.
 */
export function collapseRow(node: CollapsibleRow, done: () => void, reducedMotion: boolean): void {
  if (reducedMotion) {
    done()
    return
  }
  node.style.height = `${node.offsetHeight}px`
  // Read back, or the browser coalesces both writes and nothing transitions.
  void node.offsetHeight
  node.style.height = '0'

  // An empty list is the answer to "nothing is animating": the row is not
  // laid out, or the transition was overridden away. Either way it is done.
  const running = node.getAnimations?.() ?? []
  if (running.length === 0) {
    done()
    return
  }
  // A cancelled animation rejects; the row still has to leave.
  Promise.all(running.map((a) => a.finished)).then(done, done)
}
