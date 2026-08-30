/**
 * FR-21.9 — the currency the instance's amounts are in.
 *
 * It is a **label, never a conversion**: `value_cents` is already in this
 * currency, so naming one changes how an amount reads and never what it is.
 * That is also why the code is one instance-wide value rather than a
 * per-device preference — one database holds one currency, and two family
 * members must not read the same jacket in two of them.
 *
 * Reactive, like the locale beside it: the code arrives from the server
 * after the first paint, and a module constant would leave every amount
 * rendered before it arrived unit-less for good.
 */
import { ref } from 'vue'

/** Where the last known code is kept, so an offline start keeps its labels. */
export const CURRENCY_STORAGE_KEY = 'jitpack_currency'

/** ISO 4217's alphabetic code: exactly three letters, nothing else. */
const ISO_4217 = /^[A-Za-z]{3}$/

const currency = ref<string | null>(null)

/** The active currency code, or null while the instance names none. */
export function currentCurrency(): string | null {
  return currency.value
}

/**
 * Applies a currency for this session and persists it. An empty or
 * malformed value clears it rather than being kept: the operator naming
 * nothing and the operator naming nonsense both mean "no label here", and
 * the server has already refused the nonsense out loud at its own start.
 */
export function setCurrency(code: string | null): void {
  const next = code && ISO_4217.test(code.trim()) ? code.trim().toUpperCase() : null
  currency.value = next
  try {
    if (next) localStorage.setItem(CURRENCY_STORAGE_KEY, next)
    else localStorage.removeItem(CURRENCY_STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode) → still applied for this session.
  }
}

/** Reads the persisted code and applies it; called before mount, like initLocale. */
export function initCurrency(): void {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(CURRENCY_STORAGE_KEY)
  } catch {
    // Storage unavailable → start unit-less until the server answers.
  }
  setCurrency(raw)
}
