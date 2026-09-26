/**
 * What the quantity editor offers on M4 and M5 (FR-25.24).
 *
 * A trip item's `quantity` is decided once by generation, and without the
 * editor it is unreachable from the packing list: the G-6 stepper counts what
 * is already *packed*, and M3's review step, the other place to change the
 * planned amount, exists once and is gone. This module is the part of it that
 * is a rule rather than a control.
 *
 * Two of the quick amounts are the trip's own arithmetic rather than a
 * constant — "one per day" and "one each" — because those are the two
 * sentences people actually say about a packing amount. They are computed
 * here, not stored: a *rule* that outlives the number would need a column,
 * and the development phase has no migrations (invariant 2). What the row
 * keeps is the resulting number.
 */

/**
 * The smallest amount the editor writes. Zero is reachable and meaningful
 * — it is FR-5.5's *considered and left behind* — but it belongs to the
 * skip control, which also takes an item's FR-20.2 companions with it and
 * offers the undo that a bare "0" cannot. An editor that wrote 0 would be
 * a second, quieter way into that decision with half of its consequences.
 */
export const QUANTITY_MIN = 1

/**
 * The largest amount the editor writes. Not a database limit (the column
 * takes any non-negative integer) but a typo bound: the editor is a
 * stepper with quick values, so a three-digit amount is a slip far more
 * often than an intention.
 */
export const QUANTITY_MAX = 99

/** The fixed quick amounts, offered before the computed ones. */
export const QUANTITY_QUICK_VALUES: readonly number[] = [1, 2, 3, 5]

/**
 * Where a quick amount comes from — the label is the screen's, but whether
 * a chip explains itself ("one per day") or is just a number is decided
 * here.
 */
export type QuantityChoiceKind = 'plain' | 'days' | 'travelers'

/** One quick amount the editor offers. */
export interface QuantityChoice {
  kind: QuantityChoiceKind
  value: number
}

/** Everything outside the row that decides which quick amounts it gets. */
export interface QuantityChoiceInput {
  /** The trip's length, or null when it has no dates (FR-2.1b). */
  durationDays: number | null
  /** How many travelers the trip has. */
  travelerCount: number
  /**
   * Whether this row is one traveler's instance of a per-person item
   * (FR-25.1). Its amount is already *per person*, so "one each" would
   * multiply a number that is not a total.
   */
  perPerson: boolean
}

/**
 * clampQuantity keeps an amount inside the editor's bounds, whatever a
 * quick value or a computed suggestion hands it.
 */
export function clampQuantity(value: number): number {
  // NaN is the one value the bounds cannot decide: it compares false
  // against both of them, so it is read as the absent number it is. An
  // infinity is not absent — it is an arithmetic overshoot, and the
  // bounds have an answer for it.
  if (Number.isNaN(value)) return QUANTITY_MIN
  return Math.min(QUANTITY_MAX, Math.max(QUANTITY_MIN, Math.floor(value)))
}

/**
 * quantityChoices lists the quick amounts for one row, in the order they
 * are offered: the fixed ones first, then the trip's own two.
 *
 * A computed amount that duplicates one already on offer is dropped rather
 * than shown twice — two chips writing the same number make the reader
 * look for the difference between them.
 */
export function quantityChoices(input: QuantityChoiceInput): QuantityChoice[] {
  const choices: QuantityChoice[] = QUANTITY_QUICK_VALUES.map((value) => ({
    kind: 'plain' as const,
    value,
  }))

  const add = (kind: QuantityChoiceKind, raw: number | null): void => {
    if (raw === null || !Number.isFinite(raw)) return
    const value = clampQuantity(raw)
    // Below the minimum the chip says nothing the "1" chip does not, and
    // the clamp would round a one-day trip up to it anyway.
    if (raw < 2) return
    if (choices.some((choice) => choice.value === value)) return
    choices.push({ kind, value })
  }

  add('days', input.durationDays)
  if (!input.perPerson) add('travelers', input.travelerCount)

  return choices
}
