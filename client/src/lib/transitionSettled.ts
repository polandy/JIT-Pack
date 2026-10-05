/**
 * Whether what a `<Transition>` moves stands — for a test to wait on before it
 * presses what the movement shifts (`data-settled`).
 *
 * Playwright reads two still frames as "stable", and Vue opens every enter
 * with exactly those: the element in the page at its `-enter-from` state for
 * a double animation frame before it starts to move. Playwright checks the
 * hit target of a press's first event only, so a press begun in those frames
 * can come up on whatever slid under the finger, and the click is lost.
 *
 * Counted, not flagged: `out-in` starts the entering element before it
 * reports the leaving one gone.
 */
import { computed, ref, type ComputedRef } from 'vue'

/** What {@link useTransitionSettled} hands its component. */
export interface TransitionSettled {
  /** Nothing the transition moves is still moving. */
  readonly settled: ComputedRef<boolean>
  /** Spread onto the `<Transition>` (`v-bind`). */
  readonly hooks: {
    onBeforeEnter: () => void
    onAfterEnter: () => void
    onEnterCancelled: () => void
    onBeforeLeave: () => void
    onAfterLeave: () => void
    onLeaveCancelled: () => void
  }
  /** What was moving went with what held it — a step left, a sheet closed. */
  reset(): void
}

export function useTransitionSettled(): TransitionSettled {
  const moving = ref(0)
  const start = () => {
    moving.value += 1
  }
  const end = () => {
    moving.value = Math.max(0, moving.value - 1)
  }
  return {
    settled: computed(() => moving.value === 0),
    hooks: {
      onBeforeEnter: start,
      onAfterEnter: end,
      onEnterCancelled: end,
      onBeforeLeave: start,
      onAfterLeave: end,
      onLeaveCancelled: end,
    },
    reset() {
      moving.value = 0
    },
  }
}
