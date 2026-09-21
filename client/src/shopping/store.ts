/**
 * The shopping list's own entries (FR-30.1), held apart from the packing list.
 *
 * Its own store rather than a bucket in `tripStore`, so nothing the packing
 * list measures can reach an entry by accident — the same reason FR-7.4 gave
 * trip todos their own bucket, one step further. The orchestrator reaches it
 * only as the `FeatureStore` below, handed in by the composition root
 * (FR-30.3, ADR-066).
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { PullChange } from '@/api/types'
import type { CascadeRow } from '@/sync/cascade'
import type { FeatureStore } from '@/sync/featureModule'
import { TABLE_CODECS, type SyncRow } from '@/sync/tableRegistry'
import type { ShoppingEntry, ShoppingMode } from '@/types/domain'
import { TABLE } from '@/types/tables'

/** The tables this module holds. */
const SHOPPING_TABLES: ReadonlySet<string> = new Set<string>([TABLE.shoppingEntries])

export const useShoppingStore = defineStore('shopping', () => {
  // Flat and keyed by id: a list is read for one trip at a time and is short,
  // and a per-trip bucket would have to be rebuilt on every tombstone.
  const entries = ref<Map<string, ShoppingEntry>>(new Map())

  /**
   * A trip's entries, by name — an order that survives a reload and reads
   * the same on every device, which arrival order does not.
   */
  function getEntries(tripId: string): ShoppingEntry[] {
    return [...entries.value.values()]
      .filter((entry) => entry.trip_id === tripId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }

  /** What is still to buy on one list. */
  function openEntries(tripId: string, list: ShoppingMode): ShoppingEntry[] {
    return getEntries(tripId).filter((entry) => entry.list === list && !entry.bought)
  }

  /** What was bought from one list (FR-25.11j's reveal). */
  function boughtEntries(tripId: string, list: ShoppingMode): ShoppingEntry[] {
    return getEntries(tripId).filter((entry) => entry.list === list && entry.bought)
  }

  /**
   * The tags still in use on a trip and how many open entries carry each,
   * A–Z (FR-30.9). Read off the open entries of both lists: a tag is a
   * heading for what is left to buy, and one whose last entry was bought is
   * not offered again — typing it anew is one field away.
   */
  function tagCounts(tripId: string): { tag: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const entry of getEntries(tripId)) {
      if (entry.bought || entry.tag === null) continue
      counts.set(entry.tag, (counts.get(entry.tag) ?? 0) + 1)
    }
    return [...counts]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag))
  }

  function applyChanges(changes: PullChange[]): void {
    for (const change of changes) {
      if (change.table !== TABLE.shoppingEntries) continue
      if (change.deleted) {
        entries.value.delete(change.id)
      } else if (change.row) {
        const entry = TABLE_CODECS[TABLE.shoppingEntries].parse(change.id, change.row as SyncRow)
        entries.value.set(change.id, entry)
      }
    }
  }

  /** The entries a deleted trip takes with it. */
  function tripChildRows(tripId: string): CascadeRow[] {
    return getEntries(tripId).map((entry) => ({ table: TABLE.shoppingEntries, id: entry.id }))
  }

  function forgetTrip(tripId: string): void {
    for (const entry of getEntries(tripId)) entries.value.delete(entry.id)
  }

  return {
    getEntries,
    openEntries,
    boughtEntries,
    tagCounts,
    applyChanges,
    tripChildRows,
    forgetTrip,
  }
})

/** This module's store as the orchestrator reads and writes it (FR-30.3). */
export function shoppingFeatureStore(
  shoppingStore: ReturnType<typeof useShoppingStore> = useShoppingStore(),
): FeatureStore {
  return {
    tables: SHOPPING_TABLES,
    applyChanges: (changes) => shoppingStore.applyChanges(changes),
    tripChildRows: (tripId) => shoppingStore.tripChildRows(tripId),
    forgetTrip: (tripId) => shoppingStore.forgetTrip(tripId),
  }
}
