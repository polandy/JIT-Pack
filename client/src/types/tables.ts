/**
 * The syncable table names, named once (CODING_PRINCIPLES §4a).
 *
 * Every mutation, every pull-routing set and every store's apply switch has
 * to agree on these strings, and a mistyped literal fails as a case that is
 * simply never taken — a row that quietly never reaches its store — rather
 * than as a build error. The Go side names the same set in
 * `internal/store/store.go`; the two lists are the same contract seen from
 * either end of the wire (`Sync_API_Spec_v1.3.md` P-3).
 */
export const TABLE = {
  tags: 'tags',
  itemTags: 'item_tags',
  items: 'items',
  itemDependencies: 'item_dependencies',
  templates: 'templates',
  templateItems: 'template_items',
  templateIncludes: 'template_includes',
  templateItemTasks: 'template_item_tasks',
  trips: 'trips',
  tripMembers: 'trip_members',
  tripSeries: 'trip_series',
  destinationProfiles: 'destination_profiles',
  destinationChecklistItems: 'destination_checklist_items',
  tripItems: 'trip_items',
  travelers: 'travelers',
  containers: 'containers',
  comments: 'comments',
  notifications: 'notifications',
  /** FR-27.4, the planning-trip refresh (migration 023). */
  tripTemplateSources: 'trip_template_sources',
  tripGeneratedPositions: 'trip_generated_positions',
  tripAppliedChanges: 'trip_applied_changes',
} as const

/** Any table that travels the sync protocol. */
export type SyncTable = (typeof TABLE)[keyof typeof TABLE]
