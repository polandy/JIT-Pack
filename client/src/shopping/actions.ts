/**
 * The shopping list's writes (FR-30.1) — its own entries only.
 *
 * Written through the `ModuleHost` the orchestrator hands out: the same
 * outbox, clock and optimistic paint as every other write, and no reach into
 * the packing mutations. A packing line's check-off never comes through here;
 * it is bound into the line by the packing side (`lib/shoppingSources.ts`).
 */
import { newId } from '@/lib/ids'
import type { ShoppingLine, ShoppingSource } from '@/lib/shoppingSources'
import { dbBool } from '@/sync/columns'
import type { ModuleHost } from '@/sync/featureModule'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { TABLE_CODECS } from '@/sync/tableRegistry'
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
  ): void {
    const trimmed = name.trim()
    if (trimmed === '') return
    const mutation = host.mutation('insert', TABLE.shoppingEntries, newId(), {
      trip_id: tripId,
      name: trimmed,
      list,
      bought: dbBool(false),
      tag: normalizeTag(tag),
    })
    host.writeTrip(tripId, { mutation, optimistic: optimisticInsert(mutation) })
  }

  /** FR-30.9: files an entry under a tag, or takes it out of one with null. */
  function setTag(entry: ShoppingEntry, tag: string | null): void {
    const mutation = host.mutation('upsert', TABLE.shoppingEntries, entry.id, {
      tag: normalizeTag(tag),
    })
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

  return { addEntry, setTag, setBought, removeEntry }
}

export type ShoppingActions = ReturnType<typeof createShoppingActions>

/** What the own-entries source reads — the store satisfies it structurally. */
export interface EntryReads {
  openEntries(tripId: string, list: ShoppingMode): ShoppingEntry[]
  boughtEntries(tripId: string, list: ShoppingMode): ShoppingEntry[]
}

/**
 * The list's own entries as a source like any other, so the screen renders
 * one kind of line. The only lines that offer `remove`: an entry exists on
 * the list alone, while a packing line leaves by being bought or by its row
 * changing mode on the packing list.
 */
export function ownEntriesSource(reads: EntryReads, actions: ShoppingActions): ShoppingSource {
  function lineOf(entry: ShoppingEntry): ShoppingLine {
    return {
      key: LINE_KEY_PREFIX + entry.id,
      name: entry.name,
      quantity: 1,
      recipients: [],
      section: null,
      tag: entry.tag,
      boughtAt: entry.bought ? entry.bought_at : undefined,
      boughtBy: entry.bought ? entry.bought_by_user_id : undefined,
      buy: () => actions.setBought(entry, true),
      unbuy: () => actions.setBought(entry, false),
      remove: () => actions.removeEntry(entry),
      retag: (tag) => actions.setTag(entry, tag),
    }
  }
  return {
    open: (tripId, list) => reads.openEntries(tripId, list).map(lineOf),
    bought: (tripId, list) => reads.boughtEntries(tripId, list).map(lineOf),
  }
}
