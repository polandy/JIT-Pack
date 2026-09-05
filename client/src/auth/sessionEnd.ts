import { onSessionEnded } from './refresh'

/** What the end of a session has to reach, narrowed to the two effects. */
export interface SessionEndEffects {
  /** Drop the cached identity of the session that just ended (ADR-047). */
  forget: () => void
  /** Send the app back to the login (ADR-007). */
  toLogin: () => void
}

/**
 * Wire the two things a session ending must do, in the order it must do them.
 *
 * A function rather than four lines in `App.vue` because those four lines are
 * the only place either effect is triggered, and a rule reachable only through
 * a mounted root component has nowhere to be tested (CODING_PRINCIPLES §3).
 * The ordering is the part worth pinning: the identity goes first, so no frame
 * of the login can be rendered while the previous viewer is still cached.
 */
export function clearOnSessionEnd(effects: SessionEndEffects): () => void {
  return onSessionEnded(() => {
    effects.forget()
    effects.toLogin()
  })
}
