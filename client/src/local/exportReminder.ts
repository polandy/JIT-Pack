/**
 * Local Mode export reminder (NFR-4.11). In Local Mode there is no server
 * copy of the user's data — the portable YAML export is the only backup.
 * This tracks when the last export happened (device-local) and decides
 * when to nudge: never exported, or longer ago than the threshold.
 */

const KEY = 'jitpack_last_export'

/**
 * FR-19.8: when this device last wrote a Local Mode row. Compared against
 * the export stamp to decide whether the backup still covers the device.
 */
const LAST_WRITE_KEY = 'jitpack_last_local_write'

/** Nudge once a backup is this many days stale. */
export const EXPORT_REMINDER_DAYS = 30

function writeStamp(key: string, now: number): void {
  try {
    localStorage.setItem(key, String(now))
  } catch {
    /* storage unavailable → no reminder tracking, not fatal */
  }
}

function readStamp(key: string): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** markExported stamps "now" as the last successful export time. */
export function markExported(now: number = Date.now()): void {
  writeStamp(KEY, now)
}

/** lastExportAt returns the last export epoch-ms, or null if never. */
export function lastExportAt(): number | null {
  return readStamp(KEY)
}

/** markLocalWrite stamps "now" as the last Local Mode write (FR-19.8). */
export function markLocalWrite(now: number = Date.now()): void {
  writeStamp(LAST_WRITE_KEY, now)
}

/** lastLocalWriteAt returns the last Local Mode write epoch-ms, or null if none. */
export function lastLocalWriteAt(): number | null {
  return readStamp(LAST_WRITE_KEY)
}

/**
 * backupCoversDevice is FR-19.8's guard: the switch off Local Mode is allowed
 * only while the last backup is at least as new as the last write. A device
 * that never wrote has nothing to lose and is not held.
 */
export function backupCoversDevice(lastAt: number | null, lastWriteAt: number | null): boolean {
  if (lastWriteAt === null) return true
  return lastAt !== null && lastAt >= lastWriteAt
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
  // Never negative: a stamp can sit microseconds ahead of the `now` a screen
  // captured when it opened, and a backup that just happened must not read as
  // "-1 days ago". The same clamp covers a device whose clock moved back.
  const daysSince = Math.max(0, Math.floor((now - lastAt) / 86_400_000))
  return { due: daysSince >= thresholdDays, lastAt, daysSince }
}
