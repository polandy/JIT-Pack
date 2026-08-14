import { ref } from 'vue'

/**
 * The people who come along by default (FR-2.5a).
 *
 * A household travels with the same people nearly every time, and typing
 * them into every new trip is the kind of small repeated cost that makes
 * a wizard feel like paperwork. They are a *starting point*, never a
 * constraint: M3's step 2 adds, renames and removes exactly as before.
 *
 * **Device-local**, like the theme and the language (FR-21.3): it works
 * identically in all three modes with no schema and no sync, and Local
 * Mode has no account to hang a synced preference on. The cost is
 * honest — a second device configures its own list — and the revisit
 * trigger is exactly that: the first time someone keeps two devices in
 * step by hand, this belongs in the synced master partition.
 */
const STORAGE_KEY = 'jitpack_default_travelers'

/** Names are trimmed, non-empty and unique, in the order given. */
export function normalizeNames(raw: string[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const entry of raw) {
    const name = entry.trim()
    if (name === '' || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    names.push(name)
  }
  return names
}

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? normalizeNames(parsed.map(String)) : []
  } catch {
    // Unreadable or refused storage: no defaults is a working state.
    return []
  }
}

/** Shared across every caller, so M17 and M3 cannot disagree. */
const names = ref<string[]>(read())

export function defaultTravelers() {
  function set(next: string[]): void {
    names.value = normalizeNames(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(names.value))
    } catch {
      // Not persistable — still applies for this session.
    }
  }

  function add(name: string): void {
    set([...names.value, name])
  }

  function remove(index: number): void {
    set(names.value.filter((_, i) => i !== index))
  }

  return { names, set, add, remove }
}
