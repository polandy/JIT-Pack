import { ref, type Ref } from 'vue'

import type { TripItem } from '@/types/domain'

/** The pre-action state of one row, and what it takes to put it back. */
export interface RowUndoRecord {
  itemId: string
  /** Shown in the snackbar, so it is captured with the rest. */
  name: string
  quantity: number
  packedCount: number
  state: string
}

export interface RowUndo {
  /** The armed undo, empty when nothing is. One action at a time, by design. */
  pending: Ref<RowUndoRecord[]>
  /**
   * Snapshot the rows, then run the action. One call rather than two,
   * because the order matters and a caller that acts first would snapshot
   * the result — an undo that does nothing.
   *
   * `restore` is passed per action rather than injected once: a pack and a
   * skip change different fields, and each undo must write back only the
   * ones its own action touched.
   */
  actWithUndo: (
    rows: TripItem[],
    act: () => void,
    restore: (records: RowUndoRecord[]) => void,
  ) => void
  /**
   * Arm an undo for rows an action has *already* snapshotted for itself.
   *
   * The cascade case: FR-20.2 decides which companions go along while it
   * runs, so the caller cannot list them beforehand. `skipItem` returns
   * them as they were before the write, and this arms from that.
   */
  armUndo: (rows: TripItem[], restore: (records: RowUndoRecord[]) => void) => void
  /** Restore the armed rows, at most once. A no-op when nothing is armed. */
  undo: () => void
  /** Disarm without restoring — leaving the screen, dismissing the snackbar. */
  clear: () => void
}

/**
 * The undo behind M4's snackbars — FR-25.2's pack and FR-5.5's skip.
 *
 * M4 hides a row as soon as it is done, which is what the screen is for and
 * also what makes a mistap expensive: the evidence removes itself, and
 * getting it back costs four deliberate actions through the reveal bar. One
 * undo, live for as long as the snackbar, closes that.
 *
 * It holds *rows*, plural, because a skip is not always one row: FR-20.2
 * takes the companions along, and an undo that put back only the item the
 * user tapped would leave the rest of the cascade behind.
 */
export function useRowUndo(): RowUndo {
  const pending = ref<RowUndoRecord[]>([])
  let restoreFn: ((records: RowUndoRecord[]) => void) | null = null

  function actWithUndo(
    rows: TripItem[],
    act: () => void,
    restore: (records: RowUndoRecord[]) => void,
  ): void {
    // Replaces rather than stacks: acting on several things in a row is the
    // normal case, and a queue of snackbars would bury the list it reports
    // on while turning "undo" into "undo the oldest".
    pending.value = rows.map((row) => ({
      itemId: row.id,
      name: row.name,
      quantity: row.quantity,
      packedCount: row.packed_count,
      state: row.state,
    }))
    restoreFn = restore
    act()
  }

  function armUndo(rows: TripItem[], restore: (records: RowUndoRecord[]) => void): void {
    actWithUndo(rows, () => {}, restore)
  }

  function undo(): void {
    const records = pending.value
    const restore = restoreFn
    if (records.length === 0 || !restore) return
    // Cleared before restoring, so a second tap during the snackbar's
    // dismiss animation cannot push the same pre-action state again — which
    // would silently revert whatever happened in between.
    clear()
    restore(records)
  }

  function clear(): void {
    pending.value = []
    restoreFn = null
  }

  return { pending, actWithUndo, armUndo, undo, clear }
}
