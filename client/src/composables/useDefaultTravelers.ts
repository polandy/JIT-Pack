import { computed, ref } from 'vue'

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

/** One default traveller; `userId` links an instance account (FR-2.5a, FR-1.9), `null` is a plain name. */
export interface DefaultTraveler {
  name: string
  userId: string | null
}

/** Names are trimmed, non-empty and unique, in the order given. */
export function normalizeNames(raw: string[]): string[] {
  return normalizeEntries(raw.map((name) => ({ name, userId: null }))).map((e) => e.name)
}

/**
 * Same rules as names, plus: one account is one person, so a repeated
 * `userId` is dropped like a repeated name.
 */
export function normalizeEntries(raw: DefaultTraveler[]): DefaultTraveler[] {
  const seenNames = new Set<string>()
  const seenUsers = new Set<string>()
  const entries: DefaultTraveler[] = []
  for (const entry of raw) {
    const name = entry.name.trim()
    if (name === '' || seenNames.has(name.toLowerCase())) continue
    if (entry.userId !== null && seenUsers.has(entry.userId)) continue
    seenNames.add(name.toLowerCase())
    if (entry.userId !== null) seenUsers.add(entry.userId)
    entries.push({ name, userId: entry.userId })
  }
  return entries
}

/** Reads the current shape and the earlier plain-string one, so stored lists survive. */
function read(): DefaultTraveler[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalizeEntries(
      parsed.map((item): DefaultTraveler => {
        if (item !== null && typeof item === 'object') {
          const { name, userId } = item as { name?: unknown; userId?: unknown }
          return { name: String(name ?? ''), userId: typeof userId === 'string' ? userId : null }
        }
        return { name: String(item), userId: null }
      }),
    )
  } catch {
    // Unreadable or refused storage: no defaults is a working state.
    return []
  }
}

/** Shared across every caller, so M17 and M3 cannot disagree. */
const entries = ref<DefaultTraveler[]>(read())
const names = computed(() => entries.value.map((e) => e.name))

export function defaultTravelers() {
  function setEntries(next: DefaultTraveler[]): void {
    entries.value = normalizeEntries(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
    } catch {
      // Not persistable — still applies for this session.
    }
  }

  function set(next: string[]): void {
    setEntries(next.map((name) => ({ name, userId: null })))
  }

  function add(name: string, userId: string | null = null): void {
    setEntries([...entries.value, { name, userId }])
  }

  function remove(index: number): void {
    setEntries(entries.value.filter((_, i) => i !== index))
  }

  return { names, entries, set, add, remove }
}
