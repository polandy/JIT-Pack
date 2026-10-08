/**
 * The row's own count and its skip — the stepper, the check, FR-5.5 and its
 * way back — each announced and each behind the snackbar's one undo
 * (FR-25.2, FR-25.31). Over a {@link RowPort}, so M4 and an excursion's list
 * (FR-31.6) count the same way.
 */
import { stateFor } from '@/domain/packState'
import { t } from '@/i18n'
import type { TripItem } from '@/types/domain'

import type { RowPort } from './rowPort'

/** The acts {@link useRowSteps} returns. */
export type RowSteps = ReturnType<typeof useRowSteps>

/** Builds {@link RowSteps} over a list's port. */
export function useRowSteps(port: RowPort) {
  const { rowUndo, announceAct, announcePacked, announceSkipped } = port

  /**
   * A step of the counter is announced like a pack, and the step that
   * completes the row *is* one — it leaves the list the same way (FR-25.2).
   */
  function onIncrement(item: TripItem) {
    packStep(item, Math.min(item.packed_count + 1, item.quantity), () => port.packIncrement(item))
  }

  function onDecrement(item: TripItem) {
    packStep(item, Math.max(item.packed_count - 1, 0), () => port.packDecrement(item))
  }

  function packStep(item: TripItem, packed: number, act: () => void) {
    const name = item.name
    rowUndo.actWithUndo([item], act, port.restorePacked)
    void (packed >= item.quantity
      ? announcePacked(name)
      : announceAct(t('packing.countToast', { name, packed, quantity: item.quantity })))
  }

  function onComplete(item: TripItem) {
    const name = item.name
    rowUndo.actWithUndo([item], () => port.packComplete(item), port.restorePacked)
    void announcePacked(name)
  }

  function onZero(item: TripItem) {
    const name = item.name
    rowUndo.actWithUndo([item], () => port.packZero(item), port.restorePacked)
    void announceAct(t('packing.unpackedToast', { name }))
  }

  function onToggle(item: TripItem) {
    // Un-packing a revealed done row is announced too (FR-25.31): its result
    // is on screen, but a mistap on a list of done rows
    // is as expensive to find again as one on the open list.
    const reads = stateFor(item.packed_count, item.quantity)
    const unpacks = reads === 'packed' || reads === 'skipped'
    const name = item.name
    rowUndo.actWithUndo([item], () => port.packToggle(item), port.restorePacked)
    void (unpacks ? announceAct(t('packing.unpackedToast', { name })) : announcePacked(name))
  }

  /**
   * FR-5.5: say that a thing is deliberately not coming, rather than leaving
   * it open and indistinguishable from forgotten.
   *
   * The snackbar is not decoration here: FR-20.2 may take companions along,
   * and a cascade the user never sees is a list that changed behind their
   * back. It names them and offers the one undo that puts the whole cascade
   * back.
   */
  function onSkipItem(item: TripItem) {
    // Armed from what the skip reports rather than from the row in hand: the
    // companions are only known once the cascade has run, and the skip
    // returns them as they were *before* it wrote.
    const affected = port.skip(item)
    rowUndo.armUndo(affected, port.restoreSkip)
    void announceSkipped(
      item.name,
      affected.slice(1).map((row) => row.name),
    )
  }

  function onUnskipItem(item: TripItem) {
    rowUndo.armUndo([item], port.restoreSkip)
    port.unskip(item)
    void announceAct(t('packing.unskippedToast', { name: item.name }))
  }

  return { onIncrement, onDecrement, onComplete, onZero, onToggle, onSkipItem, onUnskipItem }
}
