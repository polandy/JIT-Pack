/**
 * One toast at the top of the screen at a time (G-23).
 *
 * Every top toast — a notice (FR-6.2), a sync conflict (NFR-4.2a), a refused
 * change (Sync-API §5) — opens in the same place, so two presented within a
 * toast's lifetime lie exactly on top of each other: the first one's button
 * cannot be reached, and it dismisses unseen. Here they wait their turn
 * instead, first in, first out, and the next one is shown only once the one
 * on screen has gone.
 *
 * The rule knows nothing of Ionic: `show` is the caller's, and resolves when
 * its toast has been dismissed. That is also what makes it testable without a
 * clock — a test resolves the dismissal itself.
 */

/**
 * More notices than this in one fetch are announced by a single summary toast
 * rather than one each: six seconds apiece would hold the top of the screen
 * for a minute after a long time away.
 */
export const NOTIFICATION_BURST_LIMIT = 3

/**
 * The attribute the toast on screen carries with the number waiting behind
 * it. It is how a test knows a second toast has arrived and is being held
 * back, rather than not having arrived yet — an absence with no signal.
 */
export const WAITING_ATTRIBUTE = 'data-waiting'

/** Presents one entry and resolves once it has been dismissed. */
export type ShowToast<T> = (entry: T) => Promise<void>

/** The queue every top toast goes through. */
export interface ToastQueue<T> {
  /** Shows `entry` now if nothing is on screen, else after those before it. */
  enqueue(entry: T): void
  /** How many entries wait behind the one on screen. */
  waiting(): number
}

/**
 * createToastQueue returns an empty queue presenting through `show`.
 * `onWaitingChange` hears every change of {@link ToastQueue.waiting}, so the
 * toast on screen can say that more are behind it.
 */
export function createToastQueue<T>(
  show: ShowToast<T>,
  onWaitingChange?: (waiting: number) => void,
): ToastQueue<T> {
  const pending: T[] = []
  let draining = false

  async function drain() {
    draining = true
    while (pending.length > 0) {
      const entry = pending.shift() as T
      onWaitingChange?.(pending.length)
      try {
        await show(entry)
      } catch {
        // A toast that never appeared must not hold back the ones behind it.
      }
    }
    draining = false
  }

  return {
    enqueue(entry) {
      pending.push(entry)
      if (draining) onWaitingChange?.(pending.length)
      else void drain()
    },
    waiting: () => pending.length,
  }
}

/**
 * toastGroups splits one fetch's notices into the toasts that announce them:
 * a group of one is that notice's own toast, a larger group is one summary
 * toast for all of them. Order is kept.
 */
export function toastGroups<T>(batch: readonly T[], limit = NOTIFICATION_BURST_LIMIT): T[][] {
  return batch.length > limit ? [[...batch]] : batch.map((n) => [n])
}
