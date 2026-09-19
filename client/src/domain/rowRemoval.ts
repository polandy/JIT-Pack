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
import { countItemReferences, type ItemReferenceSources } from './masterDeletion'
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
 * planRemoval names what removing `target` from `rows` takes along. The
 * companions are FR-20.2's co-skip, the same `coSkipTargets` a skip uses.
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
  return {
    packed: target.packed_count,
    notes,
    companions: coSkipTargets(target, rows, dependencies),
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

/** Everything that can keep an inventory item in use after a row is removed. */
export interface ItemUseSources extends ItemReferenceSources {
  dependencies: ItemDependency[]
}

/**
 * Whether anything uses the inventory item (FR-5.8, ADR-065): a Vorlage or
 * group position, a trip row — another traveler's row of the same item counts
 * — or another item's companion rule pointing at it. The item's *own* rules
 * are part of it and go with it; a rule pointing at it is a use, because
 * deleting the item would strip a companion from the item that requires it
 * (FR-20.4).
 *
 * What this answers is what the *device* can see. In Server Mode that is only
 * the trips it has opened, so the server asks again over every trip before it
 * deletes anything, and a use found there keeps the item untouched.
 */
export function itemInUse(itemId: string, from: ItemUseSources): boolean {
  if (countItemReferences(itemId, from) > 0) return true
  return from.dependencies.some(
    (dep) => dep.depends_on_item_id === itemId && dep.item_id !== itemId,
  )
}

/**
 * The inventory item removing `removed` leaves unused, or null — the question
 * asked *before* the removal, so the row itself is not counted. `tripItems`
 * may still hold it: the answer is the same before and after the write.
 */
export function itemLeftUnused(
  removed: { id: string; source_item_id: string | null },
  from: ItemUseSources,
): string | null {
  const itemId = removed.source_item_id
  if (itemId === null) return null
  const others = { ...from, tripItems: from.tripItems.filter((row) => row.id !== removed.id) }
  return itemInUse(itemId, others) ? null : itemId
}
