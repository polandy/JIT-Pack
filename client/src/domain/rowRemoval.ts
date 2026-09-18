/**
 * What removing a packing-list row takes with it (FR-5.8), and whether that
 * is enough to ask first.
 *
 * Removal is not FR-5.5's skip: a skipped row stays on the list as a decision,
 * a removed one is gone — for the typo, the duplicate, the thing that was
 * never going to be on this trip. It is a delete, so what it costs is decided
 * here rather than in the view: a row with nothing on it goes at once behind
 * an undo, and a row carrying something the undo cannot bring back says what
 * before it takes it (the FR-24.3 idiom).
 */
import { coSkipTargets, type CoSkippable } from './dependencies'
import type { ItemDependency } from '@/types/domain'

/** The row fields a removal reads; a `TripItem` satisfies it. */
export interface RemovableRow extends CoSkippable {
  packed_count: number
}

/** Everything a removal would take along with the row itself. */
export interface RowRemoval<T> {
  /** Units already packed, which the removal forgets. */
  packed: number
  /** Comments and FR-7.3 todos on the row — they cascade with it. */
  notes: number
  /** FR-20.2: rows that follow the main item off the list as co-skipped. */
  companions: T[]
}

/**
 * planRemoval names what removing `target` from `rows` takes along.
 *
 * The companions are FR-20.2's co-skip, with one guard `coSkipTargets` does not
 * make for itself: a dependent follows its main item only once the item is off
 * the trip, and a per-person item (FR-25.1) is still on it while another
 * traveler's row of it is not skipped.
 *
 * `notes` is passed in rather than read: the comments live in a store this
 * package does not import.
 */
export function planRemoval<T extends RemovableRow>(
  target: T,
  rows: readonly T[],
  dependencies: ItemDependency[],
  notes: number,
): RowRemoval<T> {
  const stillOnTrip = rows.some(
    (row) =>
      row.id !== target.id &&
      row.source_item_id !== null &&
      row.source_item_id === target.source_item_id &&
      row.state !== 'skipped',
  )
  return {
    packed: target.packed_count,
    notes,
    companions: stillOnTrip ? [] : coSkipTargets(target, rows, dependencies),
  }
}

/**
 * Whether the removal must be confirmed. Each of the three is something the
 * undo does not put back — packing that happened, notes that cascade away,
 * companions skipped on the removed row's account — so a removal carrying any
 * of them is asked, and one carrying none is not.
 */
export function removalNeedsConfirm<T>(removal: RowRemoval<T>): boolean {
  return removal.packed > 0 || removal.notes > 0 || removal.companions.length > 0
}
