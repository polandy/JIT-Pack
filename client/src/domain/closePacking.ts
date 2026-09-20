/**
 * FR-5.10 — finishing the packing: what each row that is still open becomes.
 *
 * The decision the action records is „everything from here on is deliberate":
 * whatever was not packed is *bewusst nicht mitgenommen* (FR-5.5) rather than
 * forgotten. Two shapes of row, and the difference between them is the whole
 * reason this is a rule and not a loop:
 *
 *  - **Nothing packed** → the skip M4's row menu already writes.
 *  - **Partly packed** → the amount shrinks to what is in the bag (variant P1,
 *    owner 2026-09-20). Four of six socks travelled; skipping the row would
 *    write quantity 0 and deny them, and M14 would lose four packed rows it
 *    could have judged. The remainder is simply no longer owed, so the trip
 *    line completes without anybody claiming the socks were left at home.
 *
 * What it never touches: a row that is already decided (packed, or skipped —
 * the *state* says so even where the amount survived the skip, FR-5.5), and
 * anything in a buy mode, which is the shopping list's business (FR-30.2).
 *
 * Pure, because three callers read it: the confirmation states what is about
 * to happen, the action writes it, and the undo puts back exactly these rows.
 */
import { stateFor } from './packState'

import { ITEM_MODE_PACK, STATE_SKIPPED, type TripItem } from '@/types/domain'

/** What closing the packing would do, and what the reader is owed first. */
export interface ClosePackingPlan {
  /** Rows nothing was packed of: they become FR-5.5's *weggelassen*. */
  skip: TripItem[]
  /** Half-packed rows: the amount shrinks to `packed_count` (P1). */
  trim: TripItem[]
  /** Both, in list order — the snapshot an undo is armed with. */
  rows: TripItem[]
  /** Of those rows, how many were due on departure day (FR-5.1). */
  late: number
  /** Of those rows, how many somebody else is holding (G-3, advisory). */
  claimed: number
}

/**
 * planPackingClose reads the list and decides, row by row.
 *
 * `isClaimed` is passed in rather than read off `packing_now_by`, because
 * whether a claim is *somebody else's* is a question about the current
 * identity, which no pure rule can answer (`orchestrator.isLockedByOther`).
 */
export function planPackingClose(
  items: readonly TripItem[],
  opts: { isClaimed?: (item: TripItem) => boolean } = {},
): ClosePackingPlan {
  const isClaimed = opts.isClaimed ?? (() => false)
  const skip: TripItem[] = []
  const trim: TripItem[] = []
  const rows: TripItem[] = []
  let late = 0
  let claimed = 0

  for (const item of items) {
    if (item.mode !== ITEM_MODE_PACK) continue
    // The decision, not the numbers: FR-5.5 made `skipped` beside an amount
    // above zero a legal row, and re-skipping it would arm an undo for a
    // change nobody made.
    if (item.state === STATE_SKIPPED) continue
    const reads = stateFor(item.packed_count, item.quantity)
    if (reads === 'open') skip.push(item)
    else if (reads === 'partial') trim.push(item)
    else continue

    rows.push(item)
    if (item.late_packer) late += 1
    if (isClaimed(item)) claimed += 1
  }

  return { skip, trim, rows, late, claimed }
}
