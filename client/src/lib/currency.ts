/**
 * An amount typed into a price field, as the `value_cents` it stores
 * (FR-21.9). The inverse of `formatValue` in `lib/format.ts` for input rather
 * than display: the field is a plain number in the currency's main unit, and
 * the row keeps whole cents.
 */

/** The typed amount in cents, or `null` for an empty or unreadable field. */
export function parseCents(input: string): number | null {
  const amount = parseFloat(input)
  return isNaN(amount) ? null : Math.round(amount * 100)
}

/** What a price field shows for stored cents — empty for none (and for zero). */
export function centsAsInput(cents: number | null): string {
  return cents ? (cents / 100).toFixed(2) : ''
}
