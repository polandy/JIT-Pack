/**
 * The client's mirror of the server's delete cascade.
 *
 * SQLite removes child rows inside the engine, where no change feed can see
 * them, so `cascadeChildren` (`internal/store/master.go`) collects them before
 * the parent goes and tombstones each one. A client has to produce the same
 * list for itself, for two reasons that arrive in different modes:
 *
 * - **Local Mode has no server at all.** The optimistic change list is what
 *   `IndexedDBPersistence` writes, and it deletes exactly the keys it is
 *   handed — so a delete naming only the parent leaves every child row on the
 *   device, where the next start reads them straight back (C-3a). The store
 *   dropping its own buckets hides this completely: the screen is right and
 *   the disk is not.
 * - **Server Mode paints before the tombstones arrive**, and for a deleted
 *   trip most of them never do — `change_log.trip_id` cascades too, so the
 *   trip partition's feed dies with the row it describes.
 *
 * The shape this produces is the server's: **one mutation, many changes**. A
 * mutation per child would ask the server to repeat a cascade it performs
 * itself, and would queue rows whose parent is already gone.
 *
 * Ordering is leaf-first — a child before the parent it hangs off — for the
 * same reason the server orders its own.
 */
import type { useMasterStore } from '@/stores/masterStore'
import type { useTripStore } from '@/stores/tripStore'
import type { SyncTable } from '@/types/tables'
import { TABLE } from '@/types/tables'
import { localTombstone } from './optimistic'
import type { PullChange } from '@/api/types'

/** One row a delete takes with it. */
export interface CascadeRow {
  table: SyncTable
  id: string
}

/** The two stores a cascade is read out of. */
export interface CascadeStores {
  tripStore: ReturnType<typeof useTripStore>
  masterStore: ReturnType<typeof useMasterStore>
}

/**
 * cascadeOf names every row a delete of `table`/`id` takes with it, leaf-first
 * and excluding the parent. It mirrors `cascadeChildren`'s switch case for
 * case; a parent not named here cascades nothing.
 */
export function cascadeOf(table: SyncTable, id: string, stores: CascadeStores): CascadeRow[] {
  const { tripStore, masterStore } = stores
  switch (table) {
    case TABLE.trips:
      return tripStore.childRows(id)
    case TABLE.tripItems:
      // A row's comments and FR-7.3 todos hang off it; trip-level comments
      // carry a null trip_item_id and are untouched.
      return tripStore.itemChildRows(id)
    case TABLE.templates:
      // The master half, plus the trip-partition table a group's delete ends:
      // FR-27.4's source registry lives in the trip store but travels the
      // master partition (spec P-3).
      return [...masterStore.childRows(table, id), ...tripStore.templateSourceRows(id)]
    default:
      return masterStore.childRows(table, id)
  }
}

/**
 * cascadeChanges is `cascadeOf` as the optimistic changes a caller hands to
 * `enqueueAndDrain` — the children's tombstones, without the parent's own.
 */
export function cascadeChanges(table: SyncTable, id: string, stores: CascadeStores): PullChange[] {
  return cascadeOf(table, id, stores).map((child) => localTombstone(child.table, child.id))
}
