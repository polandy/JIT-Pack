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
  armUndo: (
    rows: TripItem[],
    restore: (records: RowUndoRecord[]) => void,
    /**
     * What the action still owes once it can no longer be taken back — FR-5.8's
     * removal deletes the inventory item it left unused only then (ADR-065),
     * so the undo never has to bring back a deleted item with its tags and
     * photo. Runs when the record is cleared or replaced, never after an undo.
     */
    onLapse?: () => void,
  ) => void
  /**
   * Arm an undo for a task that has just been ticked off (FR-7.3, FR-7.4).
   *
   * A task is not a `TripItem`, so it has no quantity or pack state to
   * snapshot: the record only names it, and the caller's `restore` looks the
   * live row up again when it runs, so it reopens what is there *now*.
   */
  armTaskUndo: (task: { id: string; body: string }, restore: () => void) => void
  /** Restore the armed rows, at most once. A no-op when nothing is armed. */
  undo: () => void
  /**
   * Disarm without restoring — leaving the screen, dismissing the snackbar.
   * The armed action's `onLapse` runs here: the chance to take it back is over.
   */
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
  let lapseFn: (() => void) | null = null

  function actWithUndo(
    rows: TripItem[],
    act: () => void,
    restore: (records: RowUndoRecord[]) => void,
  ): void {
    // Replaces rather than stacks: acting on several things in a row is the
    // normal case, and a queue of snackbars would bury the list it reports
    // on while turning "undo" into "undo the oldest". A replaced record has
    // lapsed like a dismissed one.
    clear()
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

  function armUndo(
    rows: TripItem[],
    restore: (records: RowUndoRecord[]) => void,
    onLapse?: () => void,
  ): void {
    actWithUndo(rows, () => {}, restore)
    lapseFn = onLapse ?? null
  }

  function armTaskUndo(task: { id: string; body: string }, restore: () => void): void {
    clear()
    pending.value = [{ itemId: task.id, name: task.body, quantity: 0, packedCount: 0, state: '' }]
    restoreFn = restore
  }

  function undo(): void {
    const records = pending.value
    const restore = restoreFn
    if (records.length === 0 || !restore) return
    // Reset before restoring, so a second tap during the snackbar's dismiss
    // animation cannot push the same pre-action state again — which would
    // silently revert whatever happened in between. The lapse is dropped:
    // what it would have finished has just been taken back.
    reset()
    restore(records)
  }

  function clear(): void {
    const lapse = lapseFn
    reset()
    lapse?.()
  }

  function reset(): void {
    pending.value = []
    restoreFn = null
    lapseFn = null
  }

  return { pending, actWithUndo, armUndo, armTaskUndo, undo, clear }
}
