/**
 * Which store owns a pulled row.
 *
 * Routing is by owning **store**, never by partition: `trip_members`,
 * `trip_template_sources` and `trip_applied_changes` all travel the *master*
 * partition (Sync-API Spec P-3) and are still per-trip state. A table in
 * neither set is dropped silently — a failure with no symptom — which is why
 * `everyTableIsRouted` in the spec beside this file asserts the two sets
 * together cover `TABLE` exactly.
 *
 * It lives here rather than inside `useSyncOrchestrator` because the rule has
 * two callers: the orchestrator's own pull funnel, and the seam specs' hand-
 * written `enqueueAndDrain`, which routed by partition until a group started
 * painting rows of both (`tripLifecycle.deleteTrip`, C-3a).
 */
import { TABLE, type SyncTable } from '@/types/tables'

/** The tables `useTripStore` holds. */
export const TRIP_STORE_TABLES: ReadonlySet<string> = new Set<string>([
  TABLE.trips,
  TABLE.tripItems,
  TABLE.travelers,
  TABLE.containers,
  TABLE.comments,
  TABLE.tripMembers,
  TABLE.tripTemplateSources,
  TABLE.tripGeneratedPositions,
  TABLE.tripAppliedChanges,
])

/** The tables `useMasterStore` holds. */
export const MASTER_STORE_TABLES: ReadonlySet<string> = new Set<string>([
  TABLE.tags,
  TABLE.itemTags,
  TABLE.items,
  TABLE.templates,
  TABLE.templateItems,
  TABLE.templateIncludes,
  TABLE.templateItemTasks,
  TABLE.tripSeries,
  TABLE.destinationProfiles,
  TABLE.destinationChecklistItems,
  TABLE.itemDependencies,
])

/** Which store a table belongs to, or null for a table that travels no feed. */
export function storeFor(table: string): 'trip' | 'master' | null {
  if (TRIP_STORE_TABLES.has(table)) return 'trip'
  if (MASTER_STORE_TABLES.has(table)) return 'master'
  return null
}

/** Every syncable table, for the spec that asserts both sets cover them. */
export const ALL_SYNC_TABLES: readonly SyncTable[] = Object.values(TABLE)
