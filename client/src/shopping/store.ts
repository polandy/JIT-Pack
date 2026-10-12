/**
 * The shopping list's own entries (FR-30.1), held apart from the packing list.
 *
 * Its own store rather than a bucket in `tripStore`, so nothing the packing
 * list measures can reach an entry by accident — the same reason FR-7.4 gave
 * the trip's own tasks their own bucket, one step further. The orchestrator reaches it
 * only as the `FeatureStore` below, handed in by the composition root
 * (FR-30.3, ADR-066).
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { PullChange } from '@/api/types'
import { bucketedRows, bucketSink } from '@/sync/bucketedRows'
import type { FeatureStore } from '@/sync/featureModule'
import { applyChangesToSinks, specifiedSinks, type RowSinks } from '@/sync/sinks'
import { SHOPPING_ROWS } from './rows'
import type { ShoppingMode } from '@/types/domain'
import type { ShoppingEntry } from './types'
import { TABLE } from '@/api/tables'

export const useShoppingStore = defineStore('shopping', () => {
  // Bucketed by trip like the packing rows: a list is read for one trip at a time.
  const entries = bucketedRows(ref(new Map<string, ShoppingEntry[]>()), (r) => r.trip_id)

  /**
   * A trip's entries, by name — an order that survives a reload and reads
   * the same on every device, which arrival order does not.
   */
  function getEntries(tripId: string): ShoppingEntry[] {
    return [...entries.get(tripId)].sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    )
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

  /** The sinks, one per table this module holds — the whole of what the kernel reads. */
  const sinks: RowSinks = specifiedSinks(SHOPPING_ROWS, {
    [TABLE.shoppingEntries]: bucketSink(entries),
  })

  function applyChanges(changes: PullChange[]): void {
    applyChangesToSinks(sinks, changes)
  }

  return {
    getEntries,
    openEntries,
    boughtEntries,
    tagCounts,
    sinks,
    applyChanges,
  }
})

/** This module's store as the orchestrator reads and writes it (FR-30.3). */
export function shoppingFeatureStore(
  shoppingStore: ReturnType<typeof useShoppingStore> = useShoppingStore(),
): FeatureStore {
  return { sinks: shoppingStore.sinks }
}
