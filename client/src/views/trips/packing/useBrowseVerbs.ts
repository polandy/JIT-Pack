/**
 * FR-25.13f: what the browse-sheet's verbs do to the rows a master item
 * already has on the list, and the in-row undo the sheet offers for each.
 * Over a {@link RowPort}, so M4's quick-add and an excursion's (FR-31.6) pack,
 * skip and reopen the same way; what an *add* writes is each list's own.
 */
import { computed } from 'vue'

import { browseRowStates } from '@/domain/browseRows'
import type { PackableRow } from '@/domain/packingView'
import { STATE_PACKED, STATE_SKIPPED } from '@/types/domain'

import type { RowPort } from './rowPort'

/** The verbs {@link useBrowseVerbs} returns. */
export type BrowseVerbs<R extends PackableRow = PackableRow> = ReturnType<typeof useBrowseVerbs<R>>

/**
 * Builds {@link BrowseVerbs} over a list's port. `lockNote` names who holds a
 * row (G-3), null where nobody does.
 */
export function useBrowseVerbs<R extends PackableRow>(
  port: RowPort<R>,
  lockNote: (row: R) => string | null,
) {
  /**
   * FR-25.13c: what the list already carries — skipped rows included — is
   * not offered again by the quick-add, and it is the context the composer's
   * chip rows relate to. Bringing a skipped item back is the reveal + undo
   * path (FR-5.5), not a second add.
   */
  const excludeIds = computed(() => [
    ...new Set(
      port.rows.value.map((row) => row.source_item_id).filter((id): id is string => id !== null),
    ),
  ])

  /**
   * FR-25.13f: what the browse-sheet's two verbs may do, per master item.
   * Built here rather than in the sheet because only the list knows its rows
   * and G-3's holders — the sheet renders the answer and emits the verb.
   */
  const browseStates = computed(() =>
    browseRowStates(port.rows.value, lockNote, port.travelers.value),
  )

  /**
   * FR-25.13f: how to take back what the browse-sheet last did, keyed by the
   * master item its line stands for.
   *
   * A plain `Map` rather than the FR-25.2 snackbar's `useRowUndo`: the sheet's
   * undo lives *in the row* and therefore for as long as the sheet is open,
   * where the snackbar's lives for three seconds and only ever holds one act.
   * Each entry replaces the one before it, because the line only ever offers
   * the way back out of the last thing it did.
   */
  const browseUndo = new Map<string, () => void>()

  /** Offer `undo` as the way back out of what the line for this item just did. */
  function remember(itemId: string, undo: () => void): void {
    browseUndo.set(itemId, undo)
  }

  /** Whether the line for this item already offers a way back. */
  function remembers(itemId: string): boolean {
    return browseUndo.has(itemId)
  }

  /** Every row the list carries for one master item (FR-25.21's fan-out). */
  function rowsOfMasterItem(itemId: string): R[] {
    return port.rows.value.filter((row) => row.source_item_id === itemId)
  }

  /**
   * FR-25.13f: pack everything this master item stands for on the list, in one
   * tap. A row that is packed already is left alone — packing it again would
   * restamp somebody else's packing record with mine.
   */
  function onPack(itemId: string) {
    const rows = rowsOfMasterItem(itemId).filter((row) => row.state !== STATE_PACKED)
    const records = rows.map((row) => ({
      itemId: row.id,
      name: row.name,
      quantity: row.quantity,
      packedCount: row.packed_count,
      state: row.state,
    }))
    for (const row of rows) port.packComplete(row)
    remember(itemId, () => port.restorePacked(records))
  }

  /**
   * FR-25.13f: leave everything this master item stands for at home (FR-5.5),
   * companions included — the skip reports what went along, and the undo puts
   * back exactly those rows.
   */
  function onSkip(itemId: string) {
    const affected = rowsOfMasterItem(itemId)
      .filter((row) => row.state !== STATE_SKIPPED)
      .flatMap((row) => port.skip(row))
    const records = affected.map((row) => ({
      itemId: row.id,
      name: row.name,
      quantity: row.quantity,
      packedCount: row.packed_count,
      state: row.state,
    }))
    remember(itemId, () => port.restoreSkip(records))
  }

  /**
   * FR-25.13i: put every row this master item stands for back on the list,
   * whoever decided it and whenever.
   *
   * Not `onUndo`: that one replays a closure this run recorded, and a
   * decision from yesterday — or from another device — left none. So this is a
   * **reset** rather than a restore, and deliberately the same two writes the
   * row menu makes: a skipped row comes back at amount one (FR-5.5's skip
   * zeroed it, and only the row's own history knows what it was), a packed one
   * keeps its amount and loses its packed count.
   */
  function onReopen(itemId: string) {
    for (const row of rowsOfMasterItem(itemId)) {
      if (row.state === STATE_SKIPPED) port.unskip(row)
      else port.packZero(row)
    }
  }

  function onUndo(itemId: string) {
    const undo = browseUndo.get(itemId)
    if (!undo) return
    browseUndo.delete(itemId)
    undo()
  }

  return {
    excludeIds,
    browseStates,
    remember,
    remembers,
    rowsOfMasterItem,
    onPack,
    onSkip,
    onReopen,
    onUndo,
  }
}
