/**
 * The client's clock, as one seam.
 *
 * Everything that stamps a moment into a row — `packed_at`, `packing_now_at`,
 * `retired_at`, an applied change's `created_at` — reads a function, and the
 * orchestrator hands all of them the same one it gives the HLC generator and
 * `today`. Before this the four were separate `new Date()` calls, so a test
 * could only assert that a timestamp was truthy: the value itself was
 * whatever the run happened to take.
 *
 * Screens that merely *display* the current time are deliberately not in
 * scope; they read no row and nothing asserts them.
 */

/** Milliseconds since the epoch — the shape `Date.now` already has. */
export type NowMs = () => number

/** The same instant as an ISO-8601 string, which is what rows store. */
export type NowIso = () => string

/** Real time, used wherever no clock was supplied. */
export const defaultNowMs: NowMs = Date.now

/** Turns a millisecond clock into the ISO one the mutations write. */
export function isoFrom(now: NowMs): NowIso {
  return () => new Date(now()).toISOString()
}

/** Real time as an ISO string. */
export const defaultNowIso: NowIso = isoFrom(defaultNowMs)
