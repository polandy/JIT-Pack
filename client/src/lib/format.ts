/**
 * Shared display formatting. Lives in lib rather than domain: these are
 * presentation choices (units, precision), not packing rules.
 */

/** formatWeight renders grams as "850 g" below a kilo and "1.2 kg" from there. */
export function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`
}
