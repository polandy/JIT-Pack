/**
 * Every act on a packing row — the count, the claim, the skip, the removal,
 * the flags — each behind the snackbar's undo (FR-25.31). The row menu, the
 * cluster head's fan-out and the row's own controls all end up here.
 */
import type { ComputedRef } from 'vue'

import { stateFor } from '@/domain/packState'
import { removalNeedsConfirm } from '@/domain/rowRemoval'
import { t } from '@/i18n'
import { confirmAction, confirmDestructive } from '@/lib/confirm'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { removalSentence } from '@/lib/removalLabels'
import { presentToast } from '@/lib/toast'
import { hasCollaborativeSession } from '@/mode'
import { ITEM_MODE_BUY_LOCAL, type ITEM_MODE_PACK, type TripItem } from '@/types/domain'

import type { PackingCore } from './usePackingCore'
import type { RowFacts } from './useRowFacts'

/** How the acts reach M5: a removed row's open detail is closed with it. */
export interface DetailNav {
  openItemId: ComputedRef<string | null>
  closeItem: () => void
}

/** The acts {@link useRowActions} returns. */
export type RowActions = ReturnType<typeof useRowActions>

/** Builds {@link RowActions} over the page's core. */
export function useRowActions(core: PackingCore, facts: RowFacts, nav: DetailNav) {
  const {
    tripId,
    orchestrator,
    nameOf,
    locked,
    rowUndo,
    actUndoably,
    restorePacked,
    liveRow,
    announceAct,
    announcePacked,
    announceSkipped,
    announceRemoved,
  } = core

  /**
   * FR-25.25: the row's own avatar, tapped.
   *
   * The traveler is passed in rather than resolved here because only the view
   * model knows whether this row is an instance of a per-person item: under a
   * cluster the row is named by its *person*, so a sheet headed with the item
   * alone would not name the row it was opened from. Same composition M4 uses
   * for a lone per-person row's label.
   */
  async function onAssignRow(item: TripItem, traveler?: string | null): Promise<void> {
    if (!facts.assignableRow(item)) return
    const header = traveler ? `${item.name} · ${traveler}` : item.name
    const picked = await core.pickAssignee(header, item.packer_user_id)
    if (picked === undefined) return
    const previous = item.packer_user_id
    actUndoably(
      item,
      picked === null
        ? t('packing.unassignedToast', { name: item.name })
        : t('packing.assignedToast', { name: item.name, who: nameOf(picked) ?? '' }),
      () => orchestrator.setPacker(item, picked),
      (live) => orchestrator.setPacker(live, previous),
    )
  }

  /**
   * Claiming and giving back are each other's undo (G-3). The release derives
   * the state from the packed count, which is what the row read before the
   * claim; a re-claim is only offered back while nobody else has taken the row.
   */
  function onPackingNow(item: TripItem) {
    actUndoably(
      item,
      t('packing.claimedToast', { name: item.name }),
      () => orchestrator.packingNow(item),
      (live) => {
        if (orchestrator.holdsClaim(tripId, live)) orchestrator.releaseClaim(live)
      },
    )
  }

  /** Give the row back without packing it (G-3). */
  function onReleaseClaim(item: TripItem) {
    actUndoably(
      item,
      t('packing.releasedToast', { name: item.name }),
      () => orchestrator.releaseClaim(item),
      (live) => {
        if (!locked(live)) orchestrator.packingNow(live)
      },
    )
  }

  /**
   * FR-5.7: the only way past somebody else's claim. Server Mode only —
   * Local Mode has no server and Single-User Mode has one account, so
   * there is nobody to take a row from and the surface is absent rather
   * than shown inert (G-8).
   */
  const canTakeOver = hasCollaborativeSession()

  /**
   * The confirmation is the requirement, not politeness: it names whom you
   * are interrupting *before* the fact, and that is the whole difference
   * between a lock that can be broken and a lock that is not a lock.
   */
  async function onTakeOver(item: TripItem) {
    const holderId = orchestrator.lockHolder(tripId, item)
    const who = holderId ? nameOf(holderId) : ''
    const confirmed = await confirmAction({
      header: t('packing.takeoverConfirmTitle'),
      message: who
        ? t('packing.takeoverConfirmBody', { who, item: item.name })
        : t('packing.takeoverConfirmBodyUnknown', { item: item.name }),
      confirmLabel: t('packing.takeoverAction'),
    })
    if (!confirmed) return

    try {
      const previous = await orchestrator.takeOverClaim(tripId, item)
      const previousName = previous ? nameOf(previous) : ''
      await presentToast({
        message: previousName
          ? t('packing.takeoverDone', { who: previousName })
          : t('packing.takeoverDoneUnknown'),
        positionAnchor: FAB_ANCHOR.m4,
      })
    } catch {
      // The claim did not move, and the likeliest reason is that the screen
      // is behind: the holder packed or released the row while the sheet
      // was open. Saying so beats a silent no-op.
      await presentToast({
        message: t('packing.takeoverFailed'),
        positionAnchor: FAB_ANCHOR.m4,
      })
    }
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
    // companions are only known once the cascade has run, and `skipItem`
    // returns them as they were *before* it wrote (pinned by its own test).
    const affected = orchestrator.skipItem(tripId, item)
    rowUndo.armUndo(affected, (records) => orchestrator.restoreSkip(records))
    void announceSkipped(
      item.name,
      affected.slice(1).map((row) => row.name),
    )
  }

  /**
   * FR-5.5 over every instance at once: one undo for all of them, the way the
   * row's own skip arms one for its companions. `affected` is gathered from the
   * skips themselves — FR-20.2 co-skips a companion only once no traveler's row
   * still needs it, which only the last instance's skip can see.
   */
  function skipRows(name: string, rows: TripItem[]): void {
    const affected: TripItem[] = []
    for (const row of rows) {
      for (const hit of orchestrator.skipItem(tripId, row)) {
        if (!affected.some((known) => known.id === hit.id)) affected.push(hit)
      }
    }
    rowUndo.armUndo(affected, (records) => orchestrator.restoreSkip(records))
    const targets = new Set(rows.map((row) => row.id))
    void announceSkipped(
      name,
      affected.filter((row) => !targets.has(row.id)).map((row) => row.name),
    )
  }

  /**
   * The write, and the detail it leaves open: a removed row's M5 would otherwise
   * stand beside the list saying the item cannot be found — true, and about the
   * one thing the reader just did on purpose.
   */
  function removeRow(item: TripItem): void {
    orchestrator.removeItem(item, [])
    if (nav.openItemId.value === item.id) nav.closeItem()
  }

  /**
   * FR-5.8: off the list altogether. An untouched row goes at once and the
   * snackbar can bring it back; a row carrying packing, notes or companions says
   * what it takes along first, and is asked instead of offered.
   *
   * The inventory item the row was the only use of goes too (ADR-065) — but
   * only once the removal is final, when the snackbar lapses. So the undo only
   * ever re-inserts a row, or, after a confirmation, un-hides one (FR-25.31).
   */
  async function onRemoveItem(item: TripItem) {
    const removal = orchestrator.planRowRemoval(tripId, item)
    const leftItem = orchestrator.itemLeftByRemoval(item)
    const pruneLeftItem = () => {
      if (leftItem !== null) void orchestrator.pruneItemLeftByRemoval(tripId, leftItem)
    }
    if (!removalNeedsConfirm(removal)) {
      // A copy, not the store's row: the undo re-inserts from it after the row
      // has left the store.
      const snapshot = { ...item }
      rowUndo.armUndo(
        [snapshot],
        () => orchestrator.restoreRemovedItem(tripId, snapshot),
        pruneLeftItem,
      )
      removeRow(item)
      void announceRemoved(item.name, leftItem !== null)
      return
    }
    const confirmed = await confirmDestructive({
      header: t('packing.removeConfirmTitle', { name: item.name }),
      message: removalSentence(removal, leftItem !== null),
      confirmLabel: t('common.remove'),
      testid: 'm4-remove-confirm',
    })
    if (!confirmed) return
    removeConfirmed([item], removal.companions, pruneLeftItem)
    void announceRemoved(item.name, leftItem !== null)
  }

  /**
   * FR-5.8 over every instance at once, with the row's own two paths: nothing
   * on any of them goes behind one undo, anything the undo cannot return is
   * asked first. The inventory item goes only when these rows were its last use
   * (ADR-065) — the instances are no use of each other.
   */
  async function removeRows(name: string, rows: TripItem[]): Promise<void> {
    const removal = orchestrator.planRowsRemoval(tripId, rows)
    const leftItem = orchestrator.itemLeftByRemovals(rows)
    const pruneLeftItem = () => {
      if (leftItem !== null) void orchestrator.pruneItemLeftByRemoval(tripId, leftItem)
    }
    if (!removalNeedsConfirm(removal)) {
      const snapshots = rows.map((row) => ({ ...row }))
      rowUndo.armUndo(
        snapshots,
        () => {
          for (const snapshot of snapshots) orchestrator.restoreRemovedItem(tripId, snapshot)
        },
        pruneLeftItem,
      )
      for (const row of rows) removeRow(row)
      void announceRemoved(name, leftItem !== null)
      return
    }
    const confirmed = await confirmDestructive({
      header: t('packing.removeConfirmTitle', { name }),
      message: removalSentence(removal, leftItem !== null),
      confirmLabel: t('common.remove'),
      testid: 'm4-remove-confirm',
    })
    if (!confirmed) return
    removeConfirmed(rows, removal.companions, pruneLeftItem)
    void announceRemoved(name, leftItem !== null)
  }

  /**
   * FR-25.31: a confirmed removal has an undo too. Its companions are skipped
   * now — an ordinary write the snackbar can take back — but the rows themselves
   * only leave the screen: deleting them would take their comments and todos
   * along, and those cannot be written back under their own authors. The delete
   * is what lapses, with ADR-065's prune after it.
   */
  function removeConfirmed(
    rows: readonly TripItem[],
    companions: readonly TripItem[],
    afterDelete: () => void,
  ): void {
    const ids = new Set(rows.map((row) => row.id))
    const unhide = () => {
      for (const id of ids) core.removingRows.value.delete(id)
    }
    rowUndo.armUndo(
      [...rows, ...companions],
      (records) => {
        unhide()
        orchestrator.restoreSkip(records.filter((record) => !ids.has(record.itemId)))
      },
      () => {
        for (const id of ids) {
          const live = liveRow(id)
          if (live) orchestrator.removeItem(live, [])
        }
        unhide()
        afterDelete()
      },
    )
    for (const id of ids) core.removingRows.value.add(id)
    if (nav.openItemId.value !== null && ids.has(nav.openItemId.value)) nav.closeItem()
    orchestrator.skipRows(companions)
  }

  /**
   * FR-9.3: the flag is a judgement, not a stamp. The same menu entry sets it
   * and takes it back, and the snackbar does too (FR-25.31) — the one undo
   * every act on the list offers.
   */
  function onFlagUnused(item: TripItem, value: boolean) {
    const previous = item.flag_unused
    actUndoably(
      item,
      value
        ? t('packing.flagUnusedToast', { item: item.name })
        : t('packing.unflagUnusedToast', { item: item.name }),
      () => orchestrator.setReviewFlag(item, 'unused', value),
      (live) => orchestrator.setReviewFlag(live, 'unused', previous),
    )
  }

  /**
   * The pass's single gesture. It raises the same snackbar as the menu's
   * entry (FR-25.31): one at a time, each replacing the last,
   * so a run of taps leaves one undo for the latest rather than a stack.
   */
  function onPassToggle(item: TripItem) {
    // G-3 reaches into the leaf: a row somebody else is holding is theirs,
    // and the pass is no exception. A packed row rarely carries a live claim
    // — packing ends it — but this control must not be the one place that
    // decides otherwise.
    if (locked(item)) return
    onFlagUnused(item, !item.flag_unused)
  }

  function onUnskipItem(item: TripItem) {
    rowUndo.armUndo([item], (records) => orchestrator.restoreSkip(records))
    orchestrator.unskipItem(item)
    void announceAct(t('packing.unskippedToast', { name: item.name }))
  }

  function onLatePacker(item: TripItem, latePacker: boolean) {
    const previous = item.late_packer
    actUndoably(
      item,
      t(latePacker ? 'packing.latePackerOnToast' : 'packing.latePackerOffToast', {
        name: item.name,
      }),
      () => orchestrator.setLatePacker(item, latePacker),
      (live) => orchestrator.setLatePacker(live, previous),
    )
  }

  /** FR-5.9 from the row menu, taken back like every other act (FR-25.31). */
  function onSetMode(item: TripItem, mode: typeof ITEM_MODE_BUY_LOCAL | typeof ITEM_MODE_PACK) {
    const previous = item.mode
    actUndoably(
      item,
      t(mode === ITEM_MODE_BUY_LOCAL ? 'packing.buyLocalToast' : 'packing.packInsteadToast', {
        name: item.name,
      }),
      () => orchestrator.setMode(item, mode),
      (live) => orchestrator.setMode(live, previous),
    )
  }

  /**
   * A step of the counter is announced like a pack, and the step that
   * completes the row *is* one — it leaves the list the same way (FR-25.2).
   */
  function onIncrement(item: TripItem) {
    packStep(item, Math.min(item.packed_count + 1, item.quantity), () =>
      orchestrator.packIncrement(item),
    )
  }

  function onDecrement(item: TripItem) {
    packStep(item, Math.max(item.packed_count - 1, 0), () => orchestrator.packDecrement(item))
  }

  function packStep(item: TripItem, packed: number, act: () => void) {
    const name = item.name
    rowUndo.actWithUndo([item], act, restorePacked)
    void (packed >= item.quantity
      ? announcePacked(name)
      : announceAct(t('packing.countToast', { name, packed, quantity: item.quantity })))
  }

  function onComplete(item: TripItem) {
    const name = item.name
    rowUndo.actWithUndo([item], () => orchestrator.packComplete(item), restorePacked)
    void announcePacked(name)
  }

  function onZero(item: TripItem) {
    const name = item.name
    rowUndo.actWithUndo([item], () => orchestrator.packZero(item), restorePacked)
    void announceAct(t('packing.unpackedToast', { name }))
  }

  function onToggle(item: TripItem) {
    // Un-packing a revealed done row is announced too (FR-25.31): its result
    // is on screen, but a mistap on a list of done rows
    // is as expensive to find again as one on the open list.
    const reads = stateFor(item.packed_count, item.quantity)
    const unpacks = reads === 'packed' || reads === 'skipped'
    const name = item.name
    rowUndo.actWithUndo([item], () => orchestrator.packToggle(item), restorePacked)
    void (unpacks ? announceAct(t('packing.unpackedToast', { name })) : announcePacked(name))
  }

  return {
    onAssignRow,
    onPackingNow,
    onReleaseClaim,
    canTakeOver,
    onTakeOver,
    onSkipItem,
    skipRows,
    onRemoveItem,
    removeRows,
    onFlagUnused,
    onPassToggle,
    onUnskipItem,
    onLatePacker,
    onSetMode,
    onIncrement,
    onDecrement,
    onComplete,
    onZero,
    onToggle,
  }
}
