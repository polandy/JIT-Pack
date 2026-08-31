/**
 * Which delegated rows this device has already shown me (FR-6.1).
 *
 * Device-local for the same reason M14's dismissals are: *„since the last
 * visit"* is a fact about **this** screen on **this** device, not domain data,
 * and syncing it would make the phone's glance clear the laptop's highlight.
 *
 * A set of row ids rather than a timestamp — see `domain/dashboardSections.ts`
 * for why. It stays small on its own: an id is dropped as soon as the row it
 * names stops being assigned to me, so the store tracks what is currently
 * delegated rather than everything that ever was.
 */

const STORAGE_KEY = 'jitpack_delegation_seen'

/** The ids already shown. An unreadable store is an empty one, never a throw. */
export function loadSeenDelegations(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

/**
 * Record exactly the rows currently delegated to me as seen — replacing the
 * store rather than adding to it, so an id whose row was reassigned is gone
 * and the row comes back as *new* if it is ever delegated to me again.
 */
export function markDelegationsSeen(ids: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]))
  } catch {
    // A device that refuses storage shows every delegation as new, which is
    // noisier than the truth but never wrong about what is assigned.
  }
}
