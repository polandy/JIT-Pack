/**
 * What M4's row slices need from the list they serve, and nothing more — so
 * the same slices run the trip's packing list (`usePackingCore` fills it) and
 * an excursion's list (FR-31.6, `excursion/useExcursionRowPort` fills it).
 *
 * The rows are whatever the list carries — M4's trip items, an excursion's
 * lines — read through the packing view's {@link PackableRow} port.
 */
import type { ComputedRef } from 'vue'

import type { PackAnnouncer } from '@/composables/usePackAnnouncer'
import type { RowUndoRecord } from '@/composables/useRowUndo'
import type { PackableRow } from '@/domain/packingView'
import type { Traveler } from '@/types/domain'

/** The narrow port M4's row slices act through. */
export interface RowPort<R extends PackableRow = PackableRow> extends Pick<
  PackAnnouncer,
  'rowUndo' | 'announceAct' | 'announcePacked' | 'announceSkipped'
> {
  /** Every row the list shows, a removal still inside its undo left out. */
  readonly rows: ComputedRef<R[]>
  /** The people the list is for — the trip's travelers, or the ones going. */
  readonly travelers: ComputedRef<Traveler[]>
  /** The days FR-25.24's amount choices are offered for. */
  readonly span: ComputedRef<{ start: string | null; end: string | null }>
  /** The row as it stands now, or null once it has left the list. */
  liveRow(id: string): R | null
  /**
   * Whether the row's own controls are inert here: somebody else holds it
   * (G-3), or the screen is asking FR-9.3's question instead.
   */
  inert(row: R): boolean

  /** FR-25.24: the amount; a packed count above it is clamped. */
  setQuantity(row: R, quantity: number): void
  /** The stepper's ＋ (FR-25.2). */
  packIncrement(row: R): void
  /** The stepper's −. */
  packDecrement(row: R): void
  /** All of it in. */
  packComplete(row: R): void
  /** None of it in. */
  packZero(row: R): void
  /** The check: in, or out again. */
  packToggle(row: R): void
  /**
   * FR-5.5: decided against. Returns every row it skipped, this one first,
   * as they were before the write — the undo puts back exactly those.
   */
  skip(row: R): R[]
  /** Back on the list (FR-5.5's way back). */
  unskip(row: R): void

  /** Put back what a pack changed: the packed count and the state. */
  restorePacked(records: RowUndoRecord[]): void
  /** Put back what a skip or an amount changed: amount, packed count and state. */
  restoreSkip(records: RowUndoRecord[]): void
}

/**
 * FR-25.31: act on one row behind the snackbar's undo. `restore` gets the row
 * as it is *when the undo fires* and writes back only the field its act
 * changed — building the write from the row in hand would revert whatever
 * landed in between (the reason `restorePack` re-reads, too). A row deleted
 * meanwhile stays deleted.
 */
export function actUndoably<R extends PackableRow>(
  port: RowPort<R>,
  row: R,
  message: string,
  act: () => void,
  restore: (live: R) => void,
): void {
  const id = row.id
  port.rowUndo.armAction(row.name, () => {
    const live = port.liveRow(id)
    if (live) restore(live)
  })
  act()
  void port.announceAct(message)
}
