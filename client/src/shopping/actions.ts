/**
 * The shopping list's writes (FR-30.1) — its own entries only.
 *
 * Written through the `ModuleHost` the orchestrator hands out: the same
 * outbox, clock and optimistic paint as every other write, and no reach into
 * the packing mutations. A packing line's check-off never comes through here;
 * it is bound into the line by the packing side (`lib/shoppingSources.ts`).
 */
import { nextPosition } from '@/lib/handOrder'
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

/** What the writes read back: the trip's entries, for the next free place. */
export interface EntryPlaces {
  getEntries(tripId: string): ShoppingEntry[]
}

export function createShoppingActions(host: ModuleHost, places: EntryPlaces) {
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
    ideaId: string | null = null,
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
      // FR-30.13: typed by hand, so at the end of whichever heading it is
      // filed under — past every entry of the trip, so past every one there.
      position: nextPosition(places.getEntries(tripId).map((entry) => entry.position)),
      // FR-29.13: made from an idea, it names the idea.
      ...(ideaId ? { idea_id: ideaId } : {}),
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

  /**
   * FR-30.12: hands the entry to somebody to buy, or to nobody with null.
   * One field, so it never overwrites a rename made on another device.
   */
  function assignEntry(entry: ShoppingEntry, userId: string | null): void {
    if (userId === entry.assignee_user_id) return
    const mutation = host.mutation('upsert', TABLE.shoppingEntries, entry.id, {
      assignee_user_id: userId,
    })
    host.writeTrip(entry.trip_id, {
      mutation,
      optimistic: optimisticUpdate(mutation, encode(entry)),
    })
  }

  /**
   * FR-30.12: hands every entry in the batch to one person at once, or to
   * nobody. Only what changes is written, and the undo gives each entry its
   * own assignee back — diffed against the entry as the batch left it, for
   * `bulkSetTag`'s reason.
   */
  function bulkSetAssignee(entries: ShoppingEntry[], userId: string | null): BulkResult {
    const changed = entries.filter((entry) => entry.assignee_user_id !== userId)
    for (const entry of changed) assignEntry(entry, userId)
    return {
      touched: changed.length,
      undo: () => {
        for (const entry of changed) {
          assignEntry({ ...entry, assignee_user_id: userId }, entry.assignee_user_id)
        }
      },
    }
  }

  /** FR-30.13: where the entry stands inside its heading — one field. */
  function placeEntry(entry: ShoppingEntry, position: number): void {
    if (position === entry.position) return
    const mutation = host.mutation('upsert', TABLE.shoppingEntries, entry.id, { position })
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
   * Puts a removed entry back under its own id — `restoreTripItem`'s shape:
   * an insert newer than the tombstone re-creates the row (ADR-052). The
   * buyer is the server's stamp (invariant 3) and does not come back; only
   * open entries are ever removed in a batch, so there is none to lose.
   */
  function restoreEntry(entry: ShoppingEntry): void {
    const mutation = host.mutation('insert', TABLE.shoppingEntries, entry.id, {
      trip_id: entry.trip_id,
      name: entry.name,
      list: entry.list,
      bought: dbBool(entry.bought),
      tag: entry.tag,
      bought_at: entry.bought_at,
      due_date: entry.due_date,
      assignee_user_id: entry.assignee_user_id,
      carried_over_at: entry.carried_over_at ?? null,
      position: entry.position ?? null,
    })
    host.writeTrip(entry.trip_id, { mutation, optimistic: optimisticInsert(mutation) })
  }

  /** FR-30.9: removes every entry in the batch at once; the undo puts each back as it was. */
  function bulkRemove(entries: ShoppingEntry[]): BulkResult {
    for (const entry of entries) removeEntry(entry)
    return {
      touched: entries.length,
      undo: () => entries.forEach(restoreEntry),
    }
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
  function bulkSetTag(entries: ShoppingEntry[], tag: string | null): BulkResult {
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
   * FR-7.12/FR-7.16: the close of the packing carries what is still open
   * *before departure* to *at the destination*, and marks when — one write
   * per entry, so the mark never stands on an entry that did not move. The
   * undo writes each entry's own list back, unmarked.
   */
  function carryEntries(entries: readonly ShoppingEntry[]): () => void {
    const moving = entries.filter((entry) => entry.list !== ITEM_MODE_BUY_LOCAL)
    const at = host.nowIso()
    for (const entry of moving) writeCarry(entry, ITEM_MODE_BUY_LOCAL, at)
    return () => {
      for (const entry of moving) {
        writeCarry({ ...entry, list: ITEM_MODE_BUY_LOCAL, carried_over_at: at }, entry.list, null)
      }
    }
  }

  function writeCarry(entry: ShoppingEntry, list: ShoppingMode, at: string | null): void {
    const mutation = host.mutation('upsert', TABLE.shoppingEntries, entry.id, {
      list,
      carried_over_at: at,
    })
    host.writeTrip(entry.trip_id, {
      mutation,
      optimistic: optimisticUpdate(mutation, encode(entry)),
    })
  }

  return {
    addEntry,
    updateEntry,
    setBought,
    assignEntry,
    placeEntry,
    removeEntry,
    bulkRemove,
    bulkSetTag,
    bulkSetAssignee,
    carryEntries,
  }
}

export type ShoppingActions = ReturnType<typeof createShoppingActions>

/** What a batch change reports (FR-30.9's tag, FR-30.12's assignee): how many entries it touched, and its undo. */
export interface BulkResult {
  touched: number
  undo: () => void
}

/** What the own-entries source reads — the store satisfies it structurally. */
export interface EntryReads {
  openEntries(tripId: string, list: ShoppingMode): ShoppingEntry[]
  boughtEntries(tripId: string, list: ShoppingMode): ShoppingEntry[]
}

/** What the own-entries source adds beyond a `ShoppingSource` (FR-30.9's bulk tag and removal, FR-30.12's bulk assignee). */
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
  ): BulkResult
  /** Hands every entry a line `key` in `keys` names to one person, or to nobody (FR-30.12). */
  bulkSetAssignee(
    tripId: string,
    list: ShoppingMode,
    keys: ReadonlySet<string>,
    userId: string | null,
  ): BulkResult
  /** Removes every entry a line `key` in `keys` names, with one undo for all of them. */
  bulkRemove(tripId: string, list: ShoppingMode, keys: ReadonlySet<string>): BulkResult
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
      carriedOver: entry.carried_over_at != null,
      dueDate: entry.bought ? null : entry.due_date,
      assignee: entry.assignee_user_id,
      boughtAt: entry.bought ? entry.bought_at : undefined,
      boughtBy: entry.bought ? entry.bought_by_user_id : undefined,
      buy: () => actions.setBought(entry, true),
      unbuy: () => actions.setBought(entry, false),
      remove: () => actions.removeEntry(entry),
      edit: (fields) => actions.updateEntry(entry, fields),
      assign: (userId) => actions.assignEntry(entry, userId),
      position: entry.position,
      place: (position) => actions.placeEntry(entry, position),
      ...(entry.idea_id ? { fromIdea: { tripId: entry.trip_id, ideaId: entry.idea_id } } : {}),
    }
  }
  /** The open entries a selection's line keys name. */
  function picked(tripId: string, list: ShoppingMode, keys: ReadonlySet<string>) {
    return reads.openEntries(tripId, list).filter((entry) => keys.has(LINE_KEY_PREFIX + entry.id))
  }
  return {
    open: (tripId, list) => reads.openEntries(tripId, list).map(lineOf),
    bought: (tripId, list) => reads.boughtEntries(tripId, list).map(lineOf),
    bulkSetTag: (tripId, list, keys, tag) => actions.bulkSetTag(picked(tripId, list, keys), tag),
    bulkSetAssignee: (tripId, list, keys, userId) =>
      actions.bulkSetAssignee(picked(tripId, list, keys), userId),
    bulkRemove: (tripId, list, keys) => actions.bulkRemove(picked(tripId, list, keys)),
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
  actions: Pick<ShoppingActions, 'carryEntries'>,
): PackingCloseCrossing {
  return {
    pending: (tripId) => reads.openEntries(tripId, ITEM_MODE_BUY_BEFORE).length,
    cross(tripId) {
      const entries = reads.openEntries(tripId, ITEM_MODE_BUY_BEFORE)
      return { count: entries.length, undo: actions.carryEntries(entries) }
    },
  }
}
