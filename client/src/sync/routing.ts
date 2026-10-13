/**
 * Which store owns a pulled row, and which feed carries a table's writes —
 * the store read off `KERNEL_TABLE_SPECS`, every other table being a feature
 * module's, and the feed off the server's own registry, generated into
 * `TABLE_PARTITION` (`api/tables.ts`).
 *
 * Routing is by owning **store**, never by partition: `trip_members`,
 * `trip_template_sources` and `trip_applied_changes` all travel the *master*
 * partition (Sync-API Spec P-3) and are still per-trip state.
 *
 * It lives here rather than inside `useSyncOrchestrator` because the rule has
 * two callers: the orchestrator's own pull funnel, and the seam specs' write
 * funnel, which routed by partition until a group started painting rows of
 * both (`tripLifecycle.deleteTrip`, C-3a).
 */
import { TABLE_PARTITION, type SyncTable } from '@/api/tables'
import type { PartitionType } from './partition'
import { KERNEL_TABLE_SPECS, type StoreOwner, type TableSpec } from './tableRegistry'

const KERNEL_SPECS: Partial<Record<SyncTable, TableSpec>> = KERNEL_TABLE_SPECS

/** A kernel table's store, and `feature` for every table the kernel does not specify. */
function ownerOf(table: SyncTable): StoreOwner {
  return KERNEL_SPECS[table]?.owner ?? 'feature'
}

function isSyncTable(table: string): table is SyncTable {
  return Object.hasOwn(TABLE_PARTITION, table)
}

/** Which store a table belongs to, or null for a table that travels no feed. */
export function storeFor(table: string): StoreOwner | null {
  return isSyncTable(table) ? ownerOf(table) : null
}

/**
 * The feed a table's writes are pushed on, or null for a table that travels
 * none. The server refuses a mutation on any other partition's endpoint
 * (Sync-API P-3), so this is the answer every hand-named partition at a write
 * site has to agree with.
 */
export function partitionOf(table: string): PartitionType | null {
  return isSyncTable(table) ? TABLE_PARTITION[table] : null
}
