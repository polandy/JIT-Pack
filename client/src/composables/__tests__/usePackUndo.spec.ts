/**
 * Pack undo (Addendum FR-25.2).
 *
 * M4 hides a row the moment it is done, which is the point of the screen —
 * and which means a mistap makes its own evidence disappear. Getting the
 * row back today costs four deliberate actions: find the reveal bar, show
 * the done rows, find yours among them, un-check it. FR-25.2 answers that
 * with a snackbar carrying one undo.
 *
 * The animation needs no test — `<TransitionGroup>` owns it and a test
 * that waits for a transition is the timing dependency this project
 * forbids. What has logic worth stating is the *record*: what is captured,
 * when it is captured, and what happens to it afterwards.
 */
import { describe, it, expect, vi } from 'vitest'

import { usePackUndo, type PackUndoRecord } from '../usePackUndo'
import type { TripItem } from '@/types/domain'

function item(over: Partial<TripItem> = {}): TripItem {
  return {
    id: 'i1',
    trip_id: 't1',
    name: 'Zelt',
    quantity: 1,
    packed_count: 0,
    state: 'open',
    ...over,
  } as TripItem
}

describe('usePackUndo (FR-25.2)', () => {
  it('captures the row as it was *before* the pack, not after', () => {
    // The ordering trap this seam exists to remove: a caller that packs
    // first and records second stores the packed state and its "undo"
    // does nothing. Taking the snapshot inside the same call makes the
    // wrong order unreachable rather than merely discouraged.
    const restore = vi.fn()
    const undo = usePackUndo(restore)
    const row = item({ packed_count: 2, state: 'open' })

    undo.packWithUndo(row, () => {
      row.packed_count = 6
      row.state = 'packed'
    })
    undo.undo()

    expect(restore).toHaveBeenCalledWith<[PackUndoRecord]>({
      itemId: 'i1',
      name: 'Zelt',
      packedCount: 2,
      state: 'open',
    })
  })

  it('replaces a pending undo rather than stacking it', () => {
    // Packing ten things in a row is the normal case, not the edge one.
    // Ten stacked snackbars would bury the list they are reporting on,
    // and an undo that pops them in reverse is not what anyone means by
    // "undo" while holding a suitcase.
    const restore = vi.fn()
    const undo = usePackUndo(restore)

    undo.packWithUndo(item({ id: 'i1', name: 'Zelt' }), () => {})
    undo.packWithUndo(item({ id: 'i2', name: 'Schlafsack' }), () => {})
    undo.undo()

    expect(restore).toHaveBeenCalledTimes(1)
    expect(restore.mock.calls[0]![0]).toMatchObject({ itemId: 'i2', name: 'Schlafsack' })
  })

  it('undoes once, so a second tap cannot re-apply a stale row', () => {
    // The snackbar outlives its own action by the length of its dismiss
    // animation, and a double tap there would push a second mutation
    // carrying the pre-pack count — silently reverting whatever the user
    // did in between.
    const restore = vi.fn()
    const undo = usePackUndo(restore)

    undo.packWithUndo(item(), () => {})
    undo.undo()
    undo.undo()

    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all when there is nothing to undo', () => {
    // Asserted against a recorded call rather than against the absence of
    // a throw: "it did not crash" is true of a function that does the
    // wrong thing quietly.
    const restore = vi.fn()
    usePackUndo(restore).undo()

    expect(restore).not.toHaveBeenCalled()
  })

  it('drops the pending undo when the screen clears it', () => {
    // Leaving M4 must not leave an undo armed for a list that is no
    // longer on screen.
    const restore = vi.fn()
    const undo = usePackUndo(restore)

    undo.packWithUndo(item(), () => {})
    undo.clear()
    undo.undo()

    expect(restore).not.toHaveBeenCalled()
  })

  it('reports whether an undo is armed, so the view can show one snackbar', () => {
    const undo = usePackUndo(vi.fn())
    expect(undo.pending.value).toBeNull()

    undo.packWithUndo(item({ name: 'Stirnlampe' }), () => {})
    expect(undo.pending.value?.name).toBe('Stirnlampe')

    undo.undo()
    expect(undo.pending.value).toBeNull()
  })
})
