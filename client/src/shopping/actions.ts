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

export function createShoppingActions(host: ModuleHost) {
  const encode = TABLE_CODECS[TABLE.shoppingEntries].encode

  /**
   * Adds an entry to one of the trip's two lists. A blank name is not an
   * entry — the field's own content decides, not the button.
   */
  function addEntry(tripId: string, list: ShoppingMode, name: string): void {
    const trimmed = name.trim()
    if (trimmed === '') return
    const mutation = host.mutation('insert', TABLE.shoppingEntries, newId(), {
      trip_id: tripId,
      name: trimmed,
      list,
      bought: dbBool(false),
    })
    host.writeTrip(tripId, { mutation, optimistic: optimisticInsert(mutation) })
  }

  function setBought(entry: ShoppingEntry, bought: boolean): void {
    const mutation = host.mutation('upsert', TABLE.shoppingEntries, entry.id, {
      bought: dbBool(bought),
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

  return { addEntry, setBought, removeEntry }
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
      buy: () => actions.setBought(entry, true),
      unbuy: () => actions.setBought(entry, false),
      remove: () => actions.removeEntry(entry),
    }
  }
  return {
    open: (tripId, list) => reads.openEntries(tripId, list).map(lineOf),
    bought: (tripId, list) => reads.boughtEntries(tripId, list).map(lineOf),
  }
}
