import { computed, ref } from 'vue'

/**
 * Which extra properties the M9 inventory list shows (FR-24.4).
 *
 * The list is **lean by default**: primary-tag avatar and name, nothing
 * else. The inventory is a lookup surface, not a spreadsheet — showing
 * every tag, the weight and the price on every row was the overload the
 * 2026-08-08 UX round removed.
 *
 * **Device-local**, the same persistence class as the FR-25.2 reveal-done
 * toggle: it needs no schema and no sync, works identically in all three
 * modes, and Local Mode has no account to hang a synced preference on.
 * The honest cost is that a second device configures its own view — which
 * is right for a display preference, where the weight-focused packer and
 * the price-focused shopper are often the same household on two phones.
 */

/** The properties the sheet offers, in the order it lists them. */
export const INVENTORY_PROPERTIES = ['tags', 'weight', 'price'] as const

export type InventoryProperty = (typeof INVENTORY_PROPERTIES)[number]

const STORAGE_KEY = 'jitpack_inventory_properties'

function isProperty(value: unknown): value is InventoryProperty {
  return INVENTORY_PROPERTIES.includes(value as InventoryProperty)
}

function read(): InventoryProperty[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    // A key retired by a later version is dropped rather than trusted —
    // it would otherwise resurrect as a column nothing knows how to render.
    return Array.isArray(parsed) ? parsed.filter(isProperty) : []
  } catch {
    // Unreadable or refused storage: the lean default is a working state.
    return []
  }
}

/** Shared across callers, so the sheet and the list cannot disagree. */
const shown = ref<InventoryProperty[]>(read())

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shown.value))
  } catch {
    // Not persistable — still applies for this session.
  }
}

export function inventoryProperties() {
  const shownCount = computed(() => shown.value.length)

  function isShown(key: InventoryProperty): boolean {
    return shown.value.includes(key)
  }

  function toggle(key: InventoryProperty): void {
    shown.value = isShown(key) ? shown.value.filter((k) => k !== key) : [...shown.value, key]
    persist()
  }

  /** Re-read the stored preference — what a reload sees. */
  function reload(): void {
    shown.value = read()
  }

  /** Back to lean. Exists for tests and for a future "reset view" action. */
  function reset(): void {
    shown.value = []
    persist()
  }

  return { shown, shownCount, isShown, toggle, reload, reset }
}
