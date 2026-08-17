/**
 * Row undo (Addendum FR-25.2 for the pack, FR-5.5 for the skip).
 *
 * M4 hides a row the moment it is done, which is the point of the screen —
 * and which means a mistap makes its own evidence disappear. Getting the
 * row back today costs four deliberate actions: find the reveal bar, show
 * the done rows, find yours among them, un-check it. Both actions answer
 * that with a snackbar carrying one undo.
 *
 * The animation needs no test — `<TransitionGroup>` owns it and a test
 * that waits for a transition is the timing dependency this project
 * forbids. What has logic worth stating is the *record*: what is captured,
 * when it is captured, and what happens to it afterwards.
 */
import { describe, it, expect, vi } from 'vitest'

import { useRowUndo, type RowUndoRecord } from '../useRowUndo'
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

describe('useRowUndo (FR-25.2, FR-5.5)', () => {
  it('captures the row as it was *before* the action, not after', () => {
    // The ordering trap this seam exists to remove: a caller that acts
    // first and records second stores the result and its "undo" does
    // nothing. Taking the snapshot inside the same call makes the wrong
    // order unreachable rather than merely discouraged.
    const restore = vi.fn()
    const undo = useRowUndo()
    const row = item({ packed_count: 2, state: 'open', quantity: 6 })

    undo.actWithUndo(
      [row],
      () => {
        row.packed_count = 6
        row.state = 'packed'
      },
      restore,
    )
    undo.undo()

    expect(restore).toHaveBeenCalledWith<[RowUndoRecord[]]>([
      { itemId: 'i1', name: 'Zelt', quantity: 6, packedCount: 2, state: 'open' },
    ])
  })

  it('restores a whole cascade, not only the row that was tapped (FR-20.2)', () => {
    // Skipping the drone skips its battery too. An undo that put back only
    // the drone would leave the user with a cascade half taken back and no
    // way to see which half.
    const restore = vi.fn()
    const undo = useRowUndo()

    undo.actWithUndo(
      [item({ id: 'i1', name: 'Drohne' }), item({ id: 'i2', name: 'Akku' })],
      () => {},
      restore,
    )
    undo.undo()

    expect(restore.mock.calls[0]![0].map((r: RowUndoRecord) => r.itemId)).toEqual(['i1', 'i2'])
  })

  it('sends each action to its own restore, so an undo writes back only what changed', () => {
    // A pack changes packed_count and state; a skip changes quantity as
    // well. One shared restore would have to write all three either way,
    // and the extra field would revert whatever a sync put there.
    const packRestore = vi.fn()
    const skipRestore = vi.fn()
    const undo = useRowUndo()

    undo.actWithUndo([item()], () => {}, packRestore)
    undo.actWithUndo([item({ id: 'i2' })], () => {}, skipRestore)
    undo.undo()

    expect(packRestore).not.toHaveBeenCalled()
    expect(skipRestore).toHaveBeenCalledTimes(1)
  })

  it('armUndo takes rows the action snapshotted itself (the FR-20.2 cascade)', () => {
    // The companions are only known once the cascade has run, so this arm
    // carries what the action reports rather than what the caller held.
    const restore = vi.fn()
    const undo = useRowUndo()

    undo.armUndo([item({ id: 'i1', name: 'Drohne' }), item({ id: 'i2', name: 'Akku' })], restore)
    undo.undo()

    expect(restore.mock.calls[0]![0].map((r: RowUndoRecord) => r.name)).toEqual(['Drohne', 'Akku'])
  })

  it('replaces a pending undo rather than stacking it', () => {
    // Packing ten things in a row is the normal case, not the edge one.
    // Ten stacked snackbars would bury the list they are reporting on,
    // and an undo that pops them in reverse is not what anyone means by
    // "undo" while holding a suitcase.
    const restore = vi.fn()
    const undo = useRowUndo()

    undo.actWithUndo([item({ id: 'i1', name: 'Zelt' })], () => {}, restore)
    undo.actWithUndo([item({ id: 'i2', name: 'Schlafsack' })], () => {}, restore)
    undo.undo()

    expect(restore).toHaveBeenCalledTimes(1)
    expect(restore.mock.calls[0]![0]).toMatchObject([{ itemId: 'i2', name: 'Schlafsack' }])
  })

  it('undoes once, so a second tap cannot re-apply a stale row', () => {
    // The snackbar outlives its own action by the length of its dismiss
    // animation, and a double tap there would push a second mutation
    // carrying the pre-action state — silently reverting whatever the user
    // did in between.
    const restore = vi.fn()
    const undo = useRowUndo()

    undo.actWithUndo([item()], () => {}, restore)
    undo.undo()
    undo.undo()

    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all when there is nothing to undo', () => {
    // Asserted against a recorded call rather than against the absence of
    // a throw: "it did not crash" is true of a function that does the
    // wrong thing quietly.
    const restore = vi.fn()
    useRowUndo().undo()

    expect(restore).not.toHaveBeenCalled()
  })

  it('drops the pending undo when the screen clears it', () => {
    // Leaving M4 must not leave an undo armed for a list that is no
    // longer on screen.
    const restore = vi.fn()
    const undo = useRowUndo()

    undo.actWithUndo([item()], () => {}, restore)
    undo.clear()
    undo.undo()

    expect(restore).not.toHaveBeenCalled()
  })

  it('reports whether an undo is armed, so the view can show one snackbar', () => {
    const undo = useRowUndo()
    expect(undo.pending.value).toEqual([])

    undo.actWithUndo([item({ name: 'Stirnlampe' })], () => {}, vi.fn())
    expect(undo.pending.value[0]?.name).toBe('Stirnlampe')

    undo.undo()
    expect(undo.pending.value).toEqual([])
  })
})
