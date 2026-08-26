/**
 * M1's time-of-day greeting rule (UX-15). Pure — the dashboard hands in the
 * hour, so the buckets are testable without a clock seam. Night takes a
 * neutral line: „Guten Morgen" at 00:14 was the finding, and any time-of-day
 * claim in the small hours repeats it.
 */
import type { MessageKey } from '@/i18n'

/** greetingKey buckets an hour of day into the dashboard's greeting line. */
export function greetingKey(hour: number): MessageKey {
  if (hour >= 5 && hour < 12) return 'dashboard.greetingMorning'
  if (hour >= 12 && hour < 18) return 'dashboard.greetingAfternoon'
  if (hour >= 18 && hour < 22) return 'dashboard.greetingEvening'
  return 'dashboard.greetingNight'
}
