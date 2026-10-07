/**
 * The startup greeting (FR-21.29, G-22): its device-local on/off choice and
 * the timeline the splash plays to. The splash itself is
 * `components/global/SplashScreen.vue`; this module holds what a test can
 * check without a DOM — when each phase starts and where the mark flies.
 */

/** Device-local preference, beside `jitpack_theme` (FR-21.3's pattern). */
export const SPLASH_STORAGE_KEY = 'jitpack_splash'

/** The persisted value that switches the greeting off; anything else leaves it on. */
export const SPLASH_OFF = 'off'

/** The persisted value the M17 toggle writes when it switches the greeting back on. */
export const SPLASH_ON = 'on'

/**
 * When the packed mark leaves the centre for the logo on the first screen.
 * The intro before it — the bag drawn, two cubes dropped in, the wordmark —
 * is CSS keyframes timed to end here.
 */
export const SPLASH_FLIGHT_AT_MS = 1300

/** How long the flight (or, without a landing place, the fade) takes. */
export const SPLASH_LEAVE_MS = 480

/** Under `prefers-reduced-motion`: the still mark stands this long, then fades. */
export const SPLASH_REDUCED_AT_MS = 500

/** The reduced fade's own length. */
export const SPLASH_REDUCED_LEAVE_MS = 250

/**
 * Session marker: this app start has greeted. `sessionStorage` lives exactly
 * as long as a start — it survives the reloads the app makes of itself (the
 * M19 choice, the OIDC round trip, an update, a reset connection) and is
 * fresh when the app is opened again.
 */
export const SPLASH_GREETED_KEY = 'jitpack_splash_greeted'

/** Marks the logo the splash lands on — the app bar's mark, or M19's. */
export const SPLASH_TARGET_ATTR = 'data-splash-target'

/** Whether this device greets on a cold start; on unless switched off in M17. */
export function splashEnabled(): boolean {
  try {
    return localStorage.getItem(SPLASH_STORAGE_KEY) !== SPLASH_OFF
  } catch {
    // Storage unavailable → the default, which is on.
    return true
  }
}

/**
 * Whether this page load greets, claiming the greeting for the rest of the
 * app start if so: on, and not greeted yet since the app was opened.
 */
export function claimGreeting(): boolean {
  if (!splashEnabled()) return false
  try {
    if (sessionStorage.getItem(SPLASH_GREETED_KEY) !== null) return false
    sessionStorage.setItem(SPLASH_GREETED_KEY, '1')
  } catch {
    // No session storage → no way to tell a reload from a start; greet.
  }
  return true
}

/** Persists the M17 choice; takes effect on the next cold start. */
export function setSplashEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SPLASH_STORAGE_KEY, enabled ? SPLASH_ON : SPLASH_OFF)
  } catch {
    // Not persistable → nothing to change; the next start greets as before.
  }
}

/** The part of a DOMRect the flight reads. */
export interface Box {
  left: number
  top: number
  width: number
}

/**
 * The transform that lays the splash mark exactly over the landing mark.
 * Both are square boxes of the same viewBox, so one uniform scale suffices;
 * the origin is the top-left corner (`transform-origin: 0 0`).
 */
export function flightTransform(from: Box, to: Box): string {
  const scale = to.width / from.width
  return `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`
}
