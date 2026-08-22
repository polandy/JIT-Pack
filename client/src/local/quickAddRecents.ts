/**
 * The quick-add's "Zuletzt verwendet" trail (FR-25.13c).
 *
 * Deliberately device-local (localStorage), the reviewDismissals stance:
 * recency of *this device's* adds is a typing convenience, not domain
 * data — worst case another device offers different chips. Unreadable
 * storage degrades to an empty trail, never to an error.
 */

/** Exported for tests; the trail is one key, shared by every scope. */
export const RECENTS_STORAGE_KEY = 'jitpack_quickadd_recents'

/**
 * Trail length. Longer than one chip row (CHIP_ROW_MAX) on purpose: entries
 * hidden because they are already chosen still leave enough behind to fill
 * the row.
 */
export const RECENTS_MAX = 12

/** recentItemIds returns the trail, newest first. */
export function recentItemIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    return []
  }
}

/** recordRecentItem moves the id to the front of the trail. */
export function recordRecentItem(itemId: string): void {
  const next = [itemId, ...recentItemIds().filter((id) => id !== itemId)].slice(0, RECENTS_MAX)
  try {
    localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota or privacy mode: the chip row degrades, nothing else depends on it.
  }
}
