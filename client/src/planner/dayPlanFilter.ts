/**
 * Whom the day plan is narrowed to, remembered per trip (FR-29.15).
 *
 * A viewing preference and not data — `composables/blockFold.ts`'s precedent: this
 * device's storage, never synced. Storage that throws or is absent reads as
 * nothing remembered, so the plan opens as `openingFilter` says for a first
 * visit.
 */

/** Namespaced so a trip's key cannot collide with another preference's. */
const KEY_PREFIX = 'jp_dayplan_for_'

/** What everybody is stored as — a list would be read as people. */
const EVERYBODY = 'all'

/** The remembered choice: null for everybody, undefined for none yet. */
export function readDayPlanFilter(tripId: string): string[] | null | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(KEY_PREFIX + tripId) ?? null
    if (raw === null) return undefined
    if (raw === EVERYBODY) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

export function writeDayPlanFilter(tripId: string, chosen: readonly string[] | null): void {
  try {
    globalThis.localStorage?.setItem(
      KEY_PREFIX + tripId,
      chosen === null ? EVERYBODY : JSON.stringify(chosen),
    )
  } catch {
    // A choice that cannot be kept is still honoured for this visit.
  }
}
