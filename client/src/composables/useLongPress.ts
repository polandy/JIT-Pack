/**
 * Press-and-hold gesture: a pointer that stays down and still for
 * {@link LONG_PRESS_MS} fires the callback; releasing or travelling more
 * than {@link LONG_PRESS_SLOP_PX} first disarms it. Pure timer logic with
 * no DOM access, so the 500 ms are unit-testable with fake timers — which
 * is the deterministic seam the e2e suite cannot provide (page.clock does
 * not drive Ionic's overlay presentation reliably on a warm app).
 */

/** How long a pointer must stay down before the hold fires. */
export const LONG_PRESS_MS = 500
/** How far it may travel while doing so — beyond this it is a scroll. */
export const LONG_PRESS_SLOP_PX = 8

export interface LongPress<T> {
  /** Arm the hold at the pointer's origin. A new press replaces the old. */
  down(payload: T, x: number, y: number): void
  /** Report pointer travel; past the slop the hold disarms. */
  move(x: number, y: number): void
  /** Disarm without firing — release, cancel, or leaving the element. */
  cancel(): void
}

export function useLongPress<T>(onHold: (payload: T) => void): LongPress<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let origin: { x: number; y: number } | null = null

  function cancel(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    origin = null
  }

  function down(payload: T, x: number, y: number): void {
    cancel()
    origin = { x, y }
    timer = setTimeout(() => {
      cancel()
      onHold(payload)
    }, LONG_PRESS_MS)
  }

  function move(x: number, y: number): void {
    if (!origin) return
    if (Math.hypot(x - origin.x, y - origin.y) > LONG_PRESS_SLOP_PX) cancel()
  }

  return { down, move, cancel }
}
