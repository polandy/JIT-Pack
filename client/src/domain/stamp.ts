/**
 * Relative-day timestamps for the "who did this, and how long ago" stamps
 * (FR-25.17 on M4's revealed rows, FR-25.12 on the shopping list) — pure,
 * with `now` passed in so the result is a function of its arguments alone.
 *
 * The shape is deliberate: a finished row raises the question *how long
 * ago* far more often than *on which date*, so the day is relative where
 * it can be ("today", "yesterday") and a date only when it must be. The
 * time stays absolute — "packed at 14:32" is what someone standing in
 * front of a suitcase can act on, where "3 hours ago" needs arithmetic.
 */

/** A rendered stamp; the caller words `today`/`yesterday` through `t()`. */
export interface RelativeStamp {
  /** 'today' | 'yesterday' where the day is near enough to name, else null. */
  dayKey: 'today' | 'yesterday' | null
  /** The calendar day, formatted — only meaningful when `dayKey` is null. */
  date: string
  /** Always absolute: "14:32". */
  time: string
}

/** Midnight of the day the instant falls on, in local time. */
function startOfDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
}

const DAY_MS = 86_400_000

/**
 * Formats an ISO instant relative to `now`. Days are counted between
 * calendar days rather than in elapsed hours: something packed at 23:50
 * is "yesterday" at 00:10, not "an hour ago".
 */
export function relativeStamp(at: string, now: Date, locale: string): RelativeStamp | null {
  const stamped = new Date(at)
  if (Number.isNaN(stamped.getTime())) return null

  const days = Math.round((startOfDay(now) - startOfDay(stamped)) / DAY_MS)
  return {
    dayKey: days === 0 ? 'today' : days === 1 ? 'yesterday' : null,
    date: stamped.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    time: stamped.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
  }
}
