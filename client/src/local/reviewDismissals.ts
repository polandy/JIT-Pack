/**
 * "Never ask again" store for M14 review proposals, scoped to the
 * item–template pair (UI-Spec M14 decision).
 *
 * Deliberately device-local (localStorage): there is no synced table
 * for review preferences, and a dismissal is a UI muting, not domain
 * data — worst case another device asks once more.
 */

const STORAGE_KEY = 'jitpack_review_dismissed'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function isDismissed(key: string): boolean {
  return load().has(key)
}

export function dismissProposal(key: string): void {
  const dismissed = load()
  dismissed.add(key)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]))
}
