/**
 * Local Mode export reminder (NFR-4.11). In Local Mode there is no server
 * copy of the user's data — the portable YAML export is the only backup.
 * This tracks when the last export happened (device-local) and decides
 * when to nudge: never exported, or longer ago than the threshold.
 */

const KEY = 'jitpack_last_export'

/** Nudge once a backup is this many days stale. */
export const EXPORT_REMINDER_DAYS = 30

/** markExported stamps "now" as the last successful export time. */
export function markExported(now: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(now))
  } catch {
    /* storage unavailable → no reminder tracking, not fatal */
  }
}

/** lastExportAt returns the last export epoch-ms, or null if never. */
export function lastExportAt(): number | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export interface ReminderState {
  /** Whether a reminder should be shown. */
  due: boolean
  /** Last export epoch-ms, or null if never exported. */
  lastAt: number | null
  /** Whole days since the last export, or null if never. */
  daysSince: number | null
}

/** reminderState is the pure decision: due when never exported, or when
 * the last export is at least thresholdDays old. */
export function reminderState(
  lastAt: number | null,
  now: number,
  thresholdDays: number = EXPORT_REMINDER_DAYS,
): ReminderState {
  if (lastAt === null) return { due: true, lastAt: null, daysSince: null }
  const daysSince = Math.floor((now - lastAt) / 86_400_000)
  return { due: daysSince >= thresholdDays, lastAt, daysSince }
}
