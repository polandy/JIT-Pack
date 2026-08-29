/**
 * FR-25.13f — what the inventory browse-sheet may offer on a row the scope
 * already carries.
 *
 * The sheet lists **master items**; a trip carries **trip rows**, and since
 * FR-25.21 one master item can be several of them — one per person. A verb
 * tapped on such a line therefore acts on the whole set, and whether it may
 * be offered at all is a property of the set, not of any one row. That
 * summary is this function, and it is the sheet's only source for it.
 *
 * Rows without a `source_item_id` are deliberately absent: they were typed
 * by hand and the sheet cannot match them to an inventory line. Matching
 * them by name is FR-27.10's rule for whole groups, and a second, quieter
 * copy of it here is exactly the drift FR-25.11g warns about.
 */
import type { TripItem } from '@/types/domain'

/** The state the sheet renders for a master item the scope already carries. */
export type BrowseRowState = 'open' | 'packed' | 'skipped' | 'locked'

/** One master item's whole presence on the trip. */
export interface BrowseRowSummary {
  state: BrowseRowState
  /** Every trip row generated from this master item, in the given order. */
  itemIds: string[]
  /** G-3's sentence naming the holder — non-null exactly when `locked`. */
  lockNote: string | null
}

/**
 * Summarise the trip's rows per master item.
 *
 * The state rules, in the order they are asked:
 *
 * 1. **Any row locked → `locked`**, carrying G-3's sentence about who holds
 *    it. A set somebody else is packing is not mine to act on; taking it
 *    over is FR-5.7's confirmed step and deliberately not a one-tap verb.
 *    The caller decides what "locked" means by returning a note or null —
 *    one callback rather than a predicate beside a formatter, so the state
 *    and the sentence explaining it can never disagree.
 * 2. **Every row packed → `packed`**, every row skipped → `skipped`. Both
 *    are settled: the sheet states them and offers nothing.
 * 3. **Anything else → `open`**, including a half-packed per-person set —
 *    there is something left to decide, so the verbs stay on offer and act
 *    on the rows that are not in that state yet.
 */
export function browseRowStates(
  items: readonly TripItem[],
  lockNoteOf: (item: TripItem) => string | null,
): Map<string, BrowseRowSummary> {
  const rows = new Map<string, TripItem[]>()
  for (const item of items) {
    if (item.source_item_id === null) continue
    const group = rows.get(item.source_item_id)
    if (group) group.push(item)
    else rows.set(item.source_item_id, [item])
  }

  const summaries = new Map<string, BrowseRowSummary>()
  for (const [sourceItemId, group] of rows) {
    const lockNote = group.map(lockNoteOf).find((note) => note !== null) ?? null
    summaries.set(sourceItemId, {
      state: lockNote !== null ? 'locked' : settledState(group),
      itemIds: group.map((item) => item.id),
      lockNote,
    })
  }
  return summaries
}

function settledState(group: readonly TripItem[]): BrowseRowState {
  if (group.every((item) => item.state === 'packed')) return 'packed'
  if (group.every((item) => item.state === 'skipped')) return 'skipped'
  return 'open'
}
