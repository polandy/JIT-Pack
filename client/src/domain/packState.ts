/**
 * The one derivation of a row's packing state from its numbers.
 *
 * A trip item carries a `packed_count`, a `quantity` and a `state`, and the
 * state is a *reading* of the two numbers (FR-25.2, FR-25.13f) with one
 * exception the numbers cannot express: a quantity of 0 is FR-5.5's
 * *considered and skipped*, a done row that was never meant to be packed.
 * Written once here because it had been written five times — in the
 * mutation factory, the view model and two screens — and two of the copies
 * disagreed exactly at that exception: a claim released on a skipped row, or
 * a stepper touched on one, wrote `packed` with a count of 0, and the
 * dashboard's checkbox showed a skipped row as packed.
 *
 * `packing_now` is not derived: it is a claim somebody holds (G-3/FR-5.7),
 * and the numbers say nothing about it.
 */
import type { ItemState } from '@/types/domain'

/** A state the numbers can say — every `ItemState` except the claim. */
export type DerivedPackState = Exclude<ItemState, 'packing_now'>

/**
 * stateFor reads the state off the numbers. The count is clamped to the
 * quantity first, so a count that overshot (two devices packing the same row)
 * reads as packed rather than as an impossible surplus.
 */
export function stateFor(packedCount: number, quantity: number): DerivedPackState {
  if (quantity <= 0) return 'skipped'
  const packed = Math.min(Math.max(packedCount, 0), quantity)
  if (packed === 0) return 'open'
  if (packed >= quantity) return 'packed'
  return 'partial'
}

/** Every instance is packed — a skipped row is done, but it is not this. */
export function isFullyPacked(row: { packed_count: number; quantity: number }): boolean {
  return stateFor(row.packed_count, row.quantity) === 'packed'
}

/** Some, not all, instances are packed — the checkbox's indeterminate state. */
export function isPartlyPacked(row: { packed_count: number; quantity: number }): boolean {
  return stateFor(row.packed_count, row.quantity) === 'partial'
}

/** What a row contributes to every fraction drawn above it (FR-25.22). */
export interface PackUnits {
  done: number
  total: number
}

/**
 * unitsOf reads a row as the units it contributes to a group head, a cluster
 * head and the trip line alike — so the three compose instead of counting
 * three different things (FR-25.22).
 *
 * FR-5.5's skipped row is the one case the numbers cannot express: it has no
 * units at all, and counting it as `0/0` would make a group of considered,
 * deliberately unpacked rows read as if nothing were there. It counts as one
 * unit, done — the decision was made, which is what the fraction reports.
 */
export function unitsOf(row: { packed_count: number; quantity: number }): PackUnits {
  if (row.quantity <= 0) return { done: 1, total: 1 }
  return { done: Math.min(Math.max(row.packed_count, 0), row.quantity), total: row.quantity }
}

/**
 * How far along a trip is, as a whole percentage (FR-21.23).
 *
 * The screens that draw a ring, a track or a bar all drew this fraction
 * themselves, once each, and the three had drifted apart in rounding alone.
 * It reads the trip line's units, so the figure agrees with the counter
 * printed beside it (FR-25.22).
 */
export function packedPercent(kpis: { packedItems: number; totalItems: number }): number {
  if (kpis.totalItems <= 0) return 0
  return Math.round((kpis.packedItems / kpis.totalItems) * 100)
}
