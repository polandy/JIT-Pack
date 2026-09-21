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
import { taskPhaseOf } from './tripTodos'

import {
  ITEM_MODE_PACK,
  STATE_SKIPPED,
  TASK_PHASE_BEFORE,
  type ItemTodo,
  type TripItem,
  type TripTodo,
} from '@/types/domain'

/**
 * A task as the close reads it — either kind (FR-7.3's preparation or
 * FR-7.4's trip todo), because both cross.
 */
export type ClosingTask = ItemTodo | TripTodo

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
  /**
   * FR-7.7: the still-open tasks that move to *during the trip* with the
   * close — the crossing.
   *
   * It lives in the plan rather than beside it for the reason the rest does:
   * the sentence the user confirms and the write that follows must read one
   * rule. A fourth line in the question counted somewhere else could say four
   * while three move.
   */
  tasks: ClosingTask[]
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
  opts: {
    isClaimed?: (item: TripItem) => boolean
    /** FR-7.7: every task of the trip, both kinds, for the crossing below. */
    tasks?: readonly ClosingTask[]
  } = {},
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

  return { skip, trim, rows, late, claimed, tasks: tasksCrossing(opts.tasks ?? []) }
}

/**
 * FR-7.7's crossing: which tasks stop being *before the trip* when the
 * packing is declared finished.
 *
 * Every task still open and still meant for before it — both kinds, because
 * the salve that started as a row's preparation is the story this came from.
 * A resolved task keeps its phase: it says when it *was* done, and rewriting
 * that would be inventing a second history.
 *
 * Why this is a write and not a reading: the phase is stored precisely
 * because nothing else separates „not done yet" from „always meant for
 * later". Deriving the crossing from the stamp instead would contradict a
 * field the user can set by hand, and reopening the packing would silently
 * reclaim tasks somebody has been working on since.
 *
 * And why an automatic move is right here, where FR-5.10's own reasoning
 * refuses one elsewhere: a departure date is a clock, and the concept refused
 * to let a clock decide. Closing the packing is a person saying they are
 * done. A decision may move the tasks; a date may not.
 */
export function tasksCrossing(tasks: readonly ClosingTask[]): ClosingTask[] {
  return tasks.filter(
    (task) => task.task_state === 'open' && taskPhaseOf(task) === TASK_PHASE_BEFORE,
  )
}

/**
 * Whether the packing of this trip has **just been finished** — the moment
 * FR-5.10's prompt watches for, and deliberately not the same question as
 * „what would closing decide".
 *
 * Three conditions, and each of them is a way the naive reading goes wrong:
 *
 *  - **there is something to pack at all** — a trip carrying nothing but
 *    shopping rows (FR-30.2) has an empty plan, because a buy row is not
 *    this list's, and „nothing to pack" is not „finished packing";
 *  - **nothing is open or half packed** — the list is done;
 *  - **at least one row was actually packed.** Skipping the last row is a
 *    decision rather than a moment of finishing, and the question would
 *    otherwise arrive on the back of the skip's own snackbar.
 */
export function packingIsFinished(items: readonly TripItem[]): boolean {
  let packable = 0
  let packed = 0
  let open = 0
  for (const item of items) {
    if (item.mode !== ITEM_MODE_PACK) continue
    packable += 1
    if (item.state === STATE_SKIPPED) continue
    const reads = stateFor(item.packed_count, item.quantity)
    if (reads === 'packed') packed += 1
    else if (reads !== 'skipped') open += 1
  }
  return packable > 0 && open === 0 && packed > 0
}
