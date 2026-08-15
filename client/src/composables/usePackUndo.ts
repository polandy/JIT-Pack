import { ref, type Ref } from 'vue'

import type { TripItem } from '@/types/domain'

/** The pre-pack state of one row, and what it takes to put it back. */
export interface PackUndoRecord {
  itemId: string
  /** Shown in the snackbar, so it is captured with the rest. */
  name: string
  packedCount: number
  state: string
}

export interface PackUndo {
  /** The armed undo, or null. One at a time, by design. */
  pending: Ref<PackUndoRecord | null>
  /**
   * Snapshot the row, then pack it. One call rather than two, because the
   * order matters and a caller that packs first would snapshot the packed
   * state — an undo that does nothing.
   */
  packWithUndo: (item: TripItem, pack: () => void) => void
  /** Restore the armed row, at most once. A no-op when nothing is armed. */
  undo: () => void
  /** Disarm without restoring — leaving the screen, dismissing the snackbar. */
  clear: () => void
}

/**
 * The undo behind FR-25.2's snackbar.
 *
 * M4 hides a row as soon as it is done, which is what the screen is for and
 * also what makes a mistap expensive: the evidence removes itself, and
 * getting it back costs four deliberate actions through the reveal bar. One
 * undo, live for as long as the snackbar, closes that.
 *
 * `restore` is injected rather than reaching for the orchestrator, so the
 * rules below can be stated against recorded calls instead of against a
 * sync stack.
 */
export function usePackUndo(restore: (record: PackUndoRecord) => void): PackUndo {
  const pending = ref<PackUndoRecord | null>(null)

  function packWithUndo(item: TripItem, pack: () => void): void {
    // Replaces rather than stacks: packing several things in a row is the
    // normal case, and a queue of snackbars would bury the list it reports
    // on while turning "undo" into "undo the oldest".
    pending.value = {
      itemId: item.id,
      name: item.name,
      packedCount: item.packed_count,
      state: item.state,
    }
    pack()
  }

  function undo(): void {
    const record = pending.value
    if (!record) return
    // Cleared before restoring, so a second tap during the snackbar's
    // dismiss animation cannot push the same pre-pack count again — which
    // would silently revert whatever happened in between.
    pending.value = null
    restore(record)
  }

  function clear(): void {
    pending.value = null
  }

  return { pending, packWithUndo, undo, clear }
}
