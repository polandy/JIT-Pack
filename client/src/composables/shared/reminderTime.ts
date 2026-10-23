/**
 * FR-7.18 — when the server's daily task reminder runs (FR-7.11), so a task's
 * sheet can say which reminders will come.
 *
 * The instance's config names it (`JITPACK_TASK_REMINDER_TIME`); the last
 * answer is kept so an offline start says the same, and the server's own
 * default stands in before the first. Local Mode never reads it — no server,
 * no reminder.
 */
import { computed, ref, type ComputedRef } from 'vue'
import { capabilitiesOf, readMode } from '@/mode'

/** The server's default, `notify.DefaultTaskReminderAt`. */
export const DEFAULT_REMINDER_TIME = '06:00'
/** Where the last known time is kept, so an offline start keeps it. */
export const REMINDER_TIME_STORAGE_KEY = 'jitpack_reminder_time'
const CLOCK = /^\d{2}:\d{2}$/

const at = ref(DEFAULT_REMINDER_TIME)

/**
 * Applies the instance's time for this session and persists it. An answer
 * that is no `HH:MM` — a server from before FR-7.18 sends none — changes
 * nothing.
 */
export function setReminderTime(time: string | undefined): void {
  if (time === undefined || !CLOCK.test(time)) return
  at.value = time
  try {
    localStorage.setItem(REMINDER_TIME_STORAGE_KEY, time)
  } catch {
    // Storage unavailable (private mode) → still applied for this session.
  }
}

/** Reads the persisted time; called before mount. */
export function initReminderTime(): void {
  try {
    const kept = localStorage.getItem(REMINDER_TIME_STORAGE_KEY)
    at.value = kept !== null && CLOCK.test(kept) ? kept : DEFAULT_REMINDER_TIME
  } catch {
    // Storage unavailable → the default until the server says otherwise.
  }
}

/**
 * The daily reminder's time, `HH:MM` — or null where no server reminds, which
 * is what the task sheet words differently (Local Mode, FR-7.18).
 */
export function useDailyReminder(): ComputedRef<string | null> {
  const reminded = capabilitiesOf(readMode()).serverConnection
  return computed(() => (reminded ? at.value : null))
}
