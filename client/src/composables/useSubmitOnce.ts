/**
 * G-17 — a create that leaves the screen happens once.
 *
 * The two doors that write a whole trip (M3's wizard, M19's clone) write
 * synchronously and *then* navigate away. Between the write and the repaint
 * the button is still under the finger, so an impatient second tap — or, in
 * the wizard, the Enter key that is bound to the same action (G-16) — wrote
 * a second trip with the same name on the same day. There is nothing to undo
 * it with, and nothing on the screen says it happened.
 *
 * The latch is deliberately one-way rather than a spinner that clears: the
 * act ends by leaving the screen, so "already done" is the last state this
 * page ever has. It re-opens only when the act reports that it did not
 * happen — the clone whose source has gone, which wrote nothing and
 * navigated nowhere, and whose screen must stay usable.
 */
import { readonly, ref, type Ref } from 'vue'

/** What {@link useSubmitOnce} hands its screen. */
export interface SubmitOnce {
  /** True once the act has run — bind it to the button's `disabled`. */
  readonly submitted: Readonly<Ref<boolean>>
  /**
   * Runs `act` unless it has already run. `act` returning `false` means it
   * did nothing, and the latch re-opens.
   */
  submit(act: () => boolean | void): void
}

export function useSubmitOnce(): SubmitOnce {
  const submitted = ref(false)
  return {
    submitted: readonly(submitted),
    submit(act) {
      if (submitted.value) return
      submitted.value = true
      if (act() === false) submitted.value = false
    },
  }
}
