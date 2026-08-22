import { ref } from 'vue'

/**
 * Which FR-27.15 fold suggestions this device has been told to stop offering.
 *
 * **Device-local, never synced** — the M9 property-sheet precedent
 * (`useInventoryProperties`): a dismissed hint is a viewing preference rather
 * than data, and syncing it would make one person's "stop asking" everyone's.
 *
 * The dismissal is keyed to the group's **resolved item set**, not just to the
 * pair: once that set changes, the question is genuinely a new one and the row
 * comes back. Storing the set rather than a timestamp is what makes that
 * decidable without a schema.
 */

const STORAGE_KEY = 'jitpack_fold_dismissals'

/** `${templateId}:${groupId}` → the item-set signature dismissed for it. */
type Dismissals = Record<string, string>

/** Order-independent, so two devices computing it agree (FR-27.2's rule). */
export function itemSetSignature(itemIds: string[]): string {
  return [...itemIds].sort().join(',')
}

function pairKey(templateId: string, groupId: string): string {
  return `${templateId}:${groupId}`
}

function read(): Dismissals {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    // A malformed entry is dropped rather than trusted: it would otherwise
    // suppress a suggestion forever with a signature nothing can match.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  } catch {
    // Unreadable or refused storage: offering the hint is a working state.
    return {}
  }
}

/** Shared, so every editor instance sees the same dismissals. */
const dismissals = ref<Dismissals>(read())

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissals.value))
  } catch {
    // Not persistable — still applies for this session.
  }
}

export function foldDismissals() {
  function isDismissed(templateId: string, groupId: string, itemIds: string[]): boolean {
    return dismissals.value[pairKey(templateId, groupId)] === itemSetSignature(itemIds)
  }

  function dismiss(templateId: string, groupId: string, itemIds: string[]): void {
    dismissals.value = {
      ...dismissals.value,
      [pairKey(templateId, groupId)]: itemSetSignature(itemIds),
    }
    persist()
  }

  /** Re-read what is stored — what a reload sees. */
  function reload(): void {
    dismissals.value = read()
  }

  /** Offer everything again. Exists for tests and for a future "reset view". */
  function reset(): void {
    dismissals.value = {}
    persist()
  }

  return { isDismissed, dismiss, reload, reset }
}
