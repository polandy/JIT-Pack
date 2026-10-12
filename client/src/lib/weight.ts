/**
 * A weight typed into a field, as the `weight_grams` it stores (FR-24.1).
 * The input-side sibling of `lib/currency.ts`; `formatWeight` in
 * `lib/format.ts` is the display side.
 */

/** The typed weight in whole grams, or `null` for an empty or unreadable field. */
export function parseGrams(input: string): number | null {
  const grams = parseInt(input, 10)
  return isNaN(grams) ? null : grams
}

/** What a weight field shows for stored grams — empty for none. */
export function gramsAsInput(grams: number | null): string {
  return grams === null ? '' : String(grams)
}
