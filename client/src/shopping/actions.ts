/**
 * The shopping list's writes (FR-30.1) — its own entries only.
 *
 * Written through the `ModuleHost` the orchestrator hands out: the same
 * outbox, clock and optimistic paint as every other write, and no reach into
 * the packing mutations. A packing line's check-off never comes through here;
 * it is bound into the line by the packing side (`lib/shoppingSources.ts`).
 */
import { newId } from '@/lib/ids'
import type { PackingCloseCrossing } from '@/lib/packingClose'
import type { ShoppingLine, ShoppingSource } from '@/lib/shoppingSources'
import { dbBool } from '@/sync/columns'
import type { ModuleHost } from '@/sync/featureModule'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { TABLE_CODECS } from '@/sync/tableRegistry'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL } from '@/types/domain'
import type { ShoppingEntry, ShoppingMode } from '@/types/domain'
import { TABLE } from '@/types/tables'

/** The key prefix that keeps an own entry's line apart from any source's. */
const LINE_KEY_PREFIX = 'own:'

/** The longest tag (FR-30.9) — schema.sql's CHECK and the field's `maxlength`. */
export const SHOPPING_TAG_MAX = 40

/**
 * A tag as it is stored: trimmed, and null when nothing is left — a blank is
 * no tag, not a tag named nothing (FR-30.9). Cut at the bound rather than
 * refused, because the field already stops typing there and a pasted line
 * should still land.
 */
export function normalizeTag(tag: string | null | undefined): string | null {
  const trimmed = (tag ?? '').trim().slice(0, SHOPPING_TAG_MAX).trim()
  return trimmed === '' ? null : trimmed
}

export function createShoppingActions(host: ModuleHost) {
  const encode = TABLE_CODECS[TABLE.shoppingEntries].encode

  /**
   * Adds an entry to one of the trip's two lists. A blank name is not an
   * entry — the field's own content decides, not the button.
   */
  function addEntry(
    tripId: string,
    list: ShoppingMode,
    name: string,
    tag: string | null = null,
    dueDate: string | null = null,
  ): void {
    const trimmed = name.trim()
    if (trimmed === '') return
    const mutation = host.mutation('insert', TABLE.shoppingEntries, newId(), {
      trip_id: tripId,
      name: trimmed,
      list,
      bought: dbBool(false),
      tag: normalizeTag(tag),
      due_date: dueDate,
    })
    host.writeTrip(tripId, { mutation, optimistic: optimisticInsert(mutation) })
  }

  /**
   * FR-30.9: renames an entry and/or files it under a tag, or takes it out of
   * one with null; FR-30.10: gives it a due day, or takes it off with null.
   * Only what differs is written — a blank name is no rename, and a
   * `dueDate` left out leaves the day alone.
   */
  function updateEntry(
    entry: ShoppingEntry,
    fields: { name: string; tag: string | null; dueDate?: string | null },
  ): void {
    const patch: Record<string, unknown> = {}
    const name = fields.name.trim()
    if (name !== '' && name !== entry.name) patch['name'] = name
    const tag = normalizeTag(fields.tag)
    if (tag !== entry.tag) patch['tag'] = tag
    if (fields.dueDate !== undefined && fields.dueDate !== entry.due_date) {
      patch['due_date'] = fields.dueDate
    }
    if (Object.keys(patch).length === 0) return
    const mutation = host.mutation('upsert', TABLE.shoppingEntries, entry.id, patch)
    host.writeTrip(entry.trip_id, {
      mutation,
      optimistic: optimisticUpdate(mutation, encode(entry)),
    })
  }

  /**
   * FR-30.4: the tap's time travels with the purchase and the server stamps
   * who; taking it back clears both, so no record outlives its purchase.
   */
  function setBought(entry: ShoppingEntry, bought: boolean): void {
    const mutation = host.mutation('upsert', TABLE.shoppingEntries, entry.id, {
      bought: dbBool(bought),
      bought_at: bought ? host.nowIso() : null,
      bought_by_user_id: null,
    })
    host.writeTrip(entry.trip_id, {
      mutation,
      optimistic: optimisticUpdate(mutation, encode(entry)),
    })
  }

  function removeEntry(entry: ShoppingEntry): void {
    const mutation = host.mutation('delete', TABLE.shoppingEntries, entry.id)
    host.writeTrip(entry.trip_id, { mutation, optimistic: optimisticDelete(mutation) })
  }

  /**
   * FR-30.9: files every entry in the batch under one tag at once, or clears
   * it with null — the list's own shape of M9's give/take (`giveTagToItems`),
   * flat rather than join-table-shaped because an entry carries at most one
   * tag. Only what changes is written, so re-tagging an already-tagged entry
   * beside an untagged one in the same batch does not touch the first.
   *
   * The undo cannot hand the pre-batch snapshot straight back to
   * `updateEntry`: its "only write what changed" guard diffs the target
   * against the entry it is given, and the snapshot's own tag *is* the
   * target the undo is asking for — a diff of a value against itself, which
   * looks like nothing changed and silently writes nothing. So the undo
   * diffs against `entries` as the batch actually left them (only `tag`
   * moved; nothing here touches a name), not against the snapshot.
   */
  function bulkSetTag(entries: ShoppingEntry[], tag: string | null): BulkTagResult {
    const normalized = normalizeTag(tag)
    const changed = entries.filter((entry) => entry.tag !== normalized)
    for (const entry of changed) updateEntry(entry, { name: entry.name, tag: normalized })
    return {
      touched: changed.length,
      undo: () => {
        for (const entry of changed) {
          updateEntry({ ...entry, tag: normalized }, { name: entry.name, tag: entry.tag })
        }
      },
    }
  }

  /**
   * FR-7.12: entries moved to another list — the close of the packing sends
   * what is still open *before departure* to *at the destination*. One
   * field; the undo writes each entry's own list back, and only where the
   * entry is still on the list this put it on.
   */
  function moveEntries(entries: readonly ShoppingEntry[], list: ShoppingMode): () => void {
    const moving = entries.filter((entry) => entry.list !== list)
    for (const entry of moving) writeList(entry, list)
    return () => {
      for (const entry of moving) writeList({ ...entry, list }, entry.list)
    }
  }

  function writeList(entry: ShoppingEntry, list: ShoppingMode): void {
    const mutation = host.mutation('upsert', TABLE.shoppingEntries, entry.id, { list })
    host.writeTrip(entry.trip_id, {
      mutation,
      optimistic: optimisticUpdate(mutation, encode(entry)),
    })
  }

  return { addEntry, updateEntry, setBought, removeEntry, bulkSetTag, moveEntries }
}

export type ShoppingActions = ReturnType<typeof createShoppingActions>

/** What a batch tag change reports (FR-30.9): how many entries it touched, and its undo. */
export interface BulkTagResult {
  touched: number
  undo: () => void
}

/** What the own-entries source reads — the store satisfies it structurally. */
export interface EntryReads {
  openEntries(tripId: string, list: ShoppingMode): ShoppingEntry[]
  boughtEntries(tripId: string, list: ShoppingMode): ShoppingEntry[]
}

/** What the own-entries source adds beyond a `ShoppingSource` (FR-30.9's bulk tag). */
export interface OwnEntriesSource extends ShoppingSource {
  /**
   * Files every entry a line `key` in `keys` names under one tag at once.
   * Only the open list is ever asked for — a bought line is never on offer to
   * select (M6's screen never renders a selection checkbox on the reveal).
   */
  bulkSetTag(
    tripId: string,
    list: ShoppingMode,
    keys: ReadonlySet<string>,
    tag: string | null,
  ): BulkTagResult
}

/**
 * The list's own entries as a source like any other, so the screen renders
 * one kind of line. The only lines that offer `remove`: an entry exists on
 * the list alone, while a packing line leaves by being bought or by its row
 * changing mode on the packing list.
 */
export function ownEntriesSource(reads: EntryReads, actions: ShoppingActions): OwnEntriesSource {
  function lineOf(entry: ShoppingEntry): ShoppingLine {
    return {
      key: LINE_KEY_PREFIX + entry.id,
      name: entry.name,
      quantity: 1,
      recipients: [],
      tag: entry.tag,
      dueDate: entry.bought ? null : entry.due_date,
      boughtAt: entry.bought ? entry.bought_at : undefined,
      boughtBy: entry.bought ? entry.bought_by_user_id : undefined,
      buy: () => actions.setBought(entry, true),
      unbuy: () => actions.setBought(entry, false),
      remove: () => actions.removeEntry(entry),
      edit: (fields) => actions.updateEntry(entry, fields),
    }
  }
  return {
    open: (tripId, list) => reads.openEntries(tripId, list).map(lineOf),
    bought: (tripId, list) => reads.boughtEntries(tripId, list).map(lineOf),
    bulkSetTag: (tripId, list, keys, tag) =>
      actions.bulkSetTag(
        reads.openEntries(tripId, list).filter((entry) => keys.has(LINE_KEY_PREFIX + entry.id)),
        tag,
      ),
  }
}

/**
 * FR-7.12: the shopping list's share of closing the packing — its own open
 * entries *before departure* move to *at the destination*. The packing
 * rows in a buy mode are not in here: they are the packing side's, and it
 * moves them itself (`domain/closePacking`).
 */
export function shoppingCloseCrossing(
  reads: Pick<EntryReads, 'openEntries'>,
  actions: Pick<ShoppingActions, 'moveEntries'>,
): PackingCloseCrossing {
  return {
    pending: (tripId) => reads.openEntries(tripId, ITEM_MODE_BUY_BEFORE).length,
    cross(tripId) {
      const entries = reads.openEntries(tripId, ITEM_MODE_BUY_BEFORE)
      return { count: entries.length, undo: actions.moveEntries(entries, ITEM_MODE_BUY_LOCAL) }
    },
  }
}
