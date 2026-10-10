/**
 * The table registry — one spec per syncable table: its codec, its store and
 * the rows whose delete takes it along.
 *
 * A row crosses this boundary twice: a pull hands the store a
 * `Record<string, unknown>` to turn into a domain object (`parse`), and an
 * optimistic write hands the outbox a domain object to turn back into a row
 * (`encode`). The two halves lived apart — twenty-one `rowTo*` functions
 * inside the two stores, fourteen builders in `sync/rows.ts` —
 * and nothing compared them, which is how `trips.series_name` came to be
 * read by a parser that no writer, client or server, has ever filled.
 *
 * `KERNEL_TABLE_SPECS` holds the kernel's tables; a feature module's live in
 * its own `<m>/rows.ts` (FR-30.3, ADR-066 amendment 2). Each store hands its
 * sinks over with their specs (`specifiedSinks`, `sinks.ts`), so a pulled row
 * is parsed, and a delete cascaded, by whatever the stores the orchestrator
 * holds declare — and a module's table never has to be named here.
 * Completeness — every `TABLE.*` specified exactly once, kernel and modules
 * composed — is `src/__tests__/moduleRows.spec.ts`'s, and
 * `__tests__/tableRegistry.spec.ts` holds the halves against each other.
 *
 * The encoders stay in `sync/rows.ts` and are referenced from
 * here: eight action modules import them by name, and `rowBuilders.spec.ts`
 * already holds their completeness against the domain type. The parsers had
 * no consumer outside their own store, so they moved.
 */
import { TRACK_KIND } from '@/api/types'
import type {
  AppliedChange,
  Container,
  DestinationChecklistItem,
  DestinationProfile,
  GeneratedPosition,
  ItemComment,
  ItemDependency,
  ItemTag,
  PrepTask,
  NoteAck,
  Excursion,
  ExcursionItem,
  ExcursionTraveler,
  IdeaImage,
  IdeaTrack,
  ExcursionTrack,
  TrackFields,
  TaskFacts,
  TaskTag,
  TaskPhase,
  OwnTask,
  MasterItem,
  Tag,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
  TemplateTask,
  TemplateKind,
  Traveler,
  Trip,
  TripItem,
  TripMember,
  TripSeries,
  TripTemplateSource,
} from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK } from '@/types/domain'
import { TABLE, type SyncTable } from '@/api/tables'
import { durationDays } from '@/domain/instantiate'
import { parseJsonColumn } from './columns'
import {
  checklistItemRow,
  commentRow,
  containerRow,
  dependencyRow,
  masterItemRow,
  memberRow,
  noteAckRow,
  excursionRow,
  excursionTravelerRow,
  excursionItemRow,
  excursionTrackRow,
  profileRow,
  seriesRow,
  templateItemRow,
  templateRow,
  prepTaskRow,
  ownTaskRow,
  travelerRow,
  tripRow,
  itemRow,
} from '@/sync/rows'

/** A row as it travels: SQLite's shape, not the domain's. */
export type SyncRow = Record<string, unknown>

/**
 * One table's two directions. `encode` is absent for the tables no client
 * rebuilds from domain state — their optimistic rows are built from the
 * mutation itself (C-2, PR #335), so there is no second description of the
 * row to drift.
 */
export interface TableCodec<T = unknown> {
  parse: (id: string, row: SyncRow) => T
  encode?: (value: never) => SyncRow
}

/**
 * The store that holds a table's rows on the device. A feature module's
 * store reaches the orchestrator as a `FeatureStore` (`sync/featureModule.ts`)
 * through the composition root; the table name is still the kernel's,
 * because it is wire contract rather than module code (FR-30.3, ADR-066).
 */
export type StoreOwner = 'trip' | 'master' | 'feature'

/**
 * What a store knows about one table it holds: how its rows cross the wire,
 * and which rows take them along. A kernel store and a module's declare the
 * same shape; the module's live in its own `<m>/rows.ts` and reach the kernel
 * on the store's sinks (`specifiedSinks`), never through this file.
 */
export interface RowSpec<T = unknown> extends TableCodec<T> {
  /**
   * The rows whose delete takes this table's rows along — each a column of
   * this table declared `REFERENCES parent(id) ON DELETE CASCADE` in
   * `schema.sql`, which `__tests__/cascade.spec.ts` holds this list to. The
   * client's whole delete cascade is derived from it (`cascade.ts`); Go
   * spells the same edges out per parent in `tableSpecs.cascades`.
   */
  cascadeParents?: readonly CascadeParent[]
}

/** Specs by table — a store's, a module's, or the kernel's. */
export type RowSpecs = Partial<Record<SyncTable, RowSpec>>

/**
 * A kernel table's spec: its row spec and which of the kernel's two stores
 * holds it. The Go side keeps the same facts in `tableSpecs`
 * (`internal/store/tables.go`); the feed is one of them, and reaches this side
 * generated (`TABLE_PARTITION` in `api/tables.ts`), so it is not restated here.
 *
 * Owner and feed are two facts, not one: the master feed carries the trips
 * themselves and three per-trip tables (Sync-API P-3), and every feature
 * table travels its trip's feed.
 */
export interface TableSpec<T = unknown> extends RowSpec<T> {
  owner: Exclude<StoreOwner, 'feature'>
}

/** One `ON DELETE CASCADE` reference: this table's `column` names a `table` row. */
export interface CascadeParent {
  column: string
  table: SyncTable
}

/** `column` names a row of `table`, and the row goes with it. */
export function goesWith(column: string, table: SyncTable): CascadeParent {
  return { column, table }
}

/** Every per-trip row goes with its trip. */
export const OF_TRIP = goesWith('trip_id', TABLE.trips)

/** Instance-wide master data. */
const MASTER_DATA = { owner: 'master' } as const
/** A trip's own rows, on whichever feed carries them. */
const TRIP_ROWS = { owner: 'trip', cascadeParents: [OF_TRIP] } as const
/** A feature module's rows: each goes with its trip, whose feed it travels. */
export const MODULE_ROWS = { cascadeParents: [OF_TRIP] } as const

/** A trip's row that also goes with another row of the trip. */
export function alsoWith(...parents: CascadeParent[]): readonly CascadeParent[] {
  return [OF_TRIP, ...parents]
}

function rowToTag(id: string, row: Record<string, unknown>): Tag {
  return {
    id,
    name: row['name'] as string,
    sort_order: (row['sort_order'] as number) ?? 0,
    icon: (row['icon'] as string) ?? null,
  }
}

/** FR-7.8's task tag — `rowToTag`'s shape over its own table. */
function rowToTaskTag(id: string, row: Record<string, unknown>): TaskTag {
  return {
    id,
    name: row['name'] as string,
    sort_order: (row['sort_order'] as number) ?? 0,
    icon: (row['icon'] as string) ?? null,
  }
}

function rowToItemTag(id: string, row: Record<string, unknown>): ItemTag {
  return {
    id,
    item_id: row['item_id'] as string,
    tag_id: row['tag_id'] as string,
    position: (row['position'] as number) ?? 0,
  }
}

function rowToItem(id: string, row: Record<string, unknown>): MasterItem {
  return {
    id,
    name: row['name'] as string,
    weight_grams: (row['weight_grams'] as number) ?? null,
    value_cents: (row['value_cents'] as number) ?? null,
    image_hash: (row['image_hash'] as string) ?? null,
    icon: (row['icon'] as string) ?? null,
    default_assignee_id: (row['default_assignee_id'] as string) ?? null,
    retired_at: (row['retired_at'] as string) ?? null,
    merged_into_id: (row['merged_into_id'] as string) ?? null,
  }
}

function rowToTemplate(id: string, row: Record<string, unknown>): Template {
  return {
    id,
    owner_id: row['owner_id'] as string,
    name: row['name'] as string,
    // Migration 016 defaults pre-scope rows to 'template', which is what they
    // were used as; a row from an older client is read the same way.
    kind: (row['kind'] as TemplateKind) ?? 'template',
    icon: (row['icon'] as string) ?? null,
    retired_at: (row['retired_at'] as string) ?? null,
  }
}

function rowToInclude(id: string, row: Record<string, unknown>): TemplateInclude {
  return {
    id,
    template_id: row['template_id'] as string,
    included_template_id: row['included_template_id'] as string,
  }
}

function rowToTask(id: string, row: Record<string, unknown>): TemplateItemTask {
  return {
    id,
    template_item_id: row['template_item_id'] as string,
    task: row['task'] as string,
  }
}

function rowToTemplateTask(id: string, row: Record<string, unknown>): TemplateTask {
  return {
    id,
    template_id: row['template_id'] as string,
    task: row['task'] as string,
    phase: (row['phase'] as TaskPhase | null | undefined) ?? null,
  }
}

function rowToSeries(id: string, row: Record<string, unknown>): TripSeries {
  return {
    id,
    owner_id: row['owner_id'] as string,
    name: row['name'] as string,
    default_attributes: parseJsonColumn<TripSeries['default_attributes']>(
      row['default_attributes'],
      null,
    ),
  }
}

function rowToProfile(id: string, row: Record<string, unknown>): DestinationProfile {
  return {
    id,
    series_id: row['series_id'] as string,
    notes: (row['notes'] as string) ?? null,
  }
}

function rowToChecklistItem(id: string, row: Record<string, unknown>): DestinationChecklistItem {
  return {
    id,
    profile_id: row['profile_id'] as string,
    label: row['label'] as string,
    mode: (row['mode'] as DestinationChecklistItem['mode']) ?? ITEM_MODE_BUY_LOCAL,
  }
}

function rowToDependency(id: string, row: Record<string, unknown>): ItemDependency {
  return {
    id,
    item_id: row['item_id'] as string,
    depends_on_item_id: row['depends_on_item_id'] as string,
    mode: (row['mode'] as ItemDependency['mode']) ?? 'required',
    quantity: (row['quantity'] as number) ?? null,
  }
}

function rowToTemplateItem(id: string, row: Record<string, unknown>): TemplateItem {
  return {
    id,
    template_id: row['template_id'] as string,
    item_id: row['item_id'] as string,
    quantity: (row['quantity'] as number) ?? 1,
    assignment: (row['assignment'] as TemplateItem['assignment']) ?? 'per_person',
    dedup: (row['dedup'] as TemplateItem['dedup']) ?? 'max',
    conditions: parseJsonColumn<TemplateItem['conditions']>(row['conditions'], null),
    default_mode: (row['default_mode'] as TemplateItem['default_mode']) ?? ITEM_MODE_PACK,
    late_packer: Boolean(row['late_packer']),
  }
}

function rowToTemplateSource(id: string, row: Record<string, unknown>): TripTemplateSource {
  return {
    id,
    trip_id: row['trip_id'] as string,
    template_id: row['template_id'] as string,
  }
}

function rowToGeneratedPosition(id: string, row: Record<string, unknown>): GeneratedPosition {
  return {
    id,
    trip_id: row['trip_id'] as string,
    trip_item_id: row['trip_item_id'] as string,
    source_template_id: row['source_template_id'] as string,
    source_item_id: row['source_item_id'] as string,
    traveler_id: (row['traveler_id'] as string) ?? '',
    name: row['name'] as string,
    quantity: Number(row['quantity'] ?? 0),
    mode: row['mode'] as GeneratedPosition['mode'],
    late_packer: Boolean(row['late_packer']),
    weight_grams: (row['weight_grams'] as number) ?? null,
    value_cents: (row['value_cents'] as number) ?? null,
    category_name: (row['category_name'] as string) ?? null,
    // Stored as a JSON array (migration 023): one field, written only by the
    // refresh, so there is no concurrent edit for a per-row table to protect.
    // A malformed value reads as "the refresh will re-add them", which is
    // recoverable where a thrown parse error is not.
    tasks: parseJsonColumn<unknown[]>(row['tasks'], []).map(String),
  }
}

function rowToAppliedChange(id: string, row: Record<string, unknown>): AppliedChange {
  return {
    id,
    trip_id: row['trip_id'] as string,
    source_template_id: row['source_template_id'] as string,
    source_template_name: row['source_template_name'] as string,
    kind: row['kind'] as AppliedChange['kind'],
    item_name: row['item_name'] as string,
    detail: parseJsonColumn<AppliedChange['detail']>(row['detail'], null),
    created_at: (row['created_at'] as string) ?? '',
  }
}

function rowToTrip(id: string, row: Record<string, unknown>): Trip {
  return {
    id,
    name: row['name'] as string,
    status: row['status'] as Trip['status'],
    year: Number(row['year'] ?? new Date().getFullYear()),
    start_date: (row['start_date'] as string) ?? null,
    end_date: (row['end_date'] as string) ?? null,
    // Derived, never read off the row: `trips.duration_days` is a generated
    // column and is not syncable, so no pull ever carries it.
    duration_days: durationDays(
      (row['start_date'] as string) ?? null,
      (row['end_date'] as string) ?? null,
    ),
    series_id: (row['series_id'] as string) ?? null,
    attributes: parseJsonColumn<Trip['attributes']>(row['attributes'], null),
    packing_closed_at: (row['packing_closed_at'] as string) ?? null,
    imported: Boolean(row['imported']),
  }
}

function rowToTripItem(id: string, row: Record<string, unknown>): TripItem {
  return {
    id,
    trip_id: row['trip_id'] as string,
    source_item_id: (row['source_item_id'] as string) ?? null,
    source_template_id: (row['source_template_id'] as string) ?? null,
    name: row['name'] as string,
    weight_grams: (row['weight_grams'] as number) ?? null,
    value_cents: (row['value_cents'] as number) ?? null,
    category_name: (row['category_name'] as string) ?? null,
    quantity: (row['quantity'] as number) ?? 1,
    packed_count: (row['packed_count'] as number) ?? 0,
    state: (row['state'] as TripItem['state']) ?? 'open',
    mode: (row['mode'] as TripItem['mode']) ?? ITEM_MODE_PACK,
    late_packer: Boolean(row['late_packer']),
    assigned_traveler_id: (row['assigned_traveler_id'] as string) ?? null,
    packer_user_id: (row['packer_user_id'] as string) ?? null,
    packed_by_user_id: (row['packed_by_user_id'] as string) ?? null,
    packed_at: (row['packed_at'] as string) ?? null,
    container_id: (row['container_id'] as string) ?? null,
    packing_now_by: (row['packing_now_by'] as string) ?? null,
    packing_now_at: (row['packing_now_at'] as string) ?? null,
    bought_from: (row['bought_from'] as TripItem['bought_from']) ?? null,
    bought_at: (row['bought_at'] as string) ?? null,
    bought_by_user_id: (row['bought_by_user_id'] as string) ?? null,
    flag_unused: Boolean(row['flag_unused']),
    flag_missing: Boolean(row['flag_missing']),
    carried_over_at: (row['carried_over_at'] as string | null | undefined) ?? null,
    shopping_position: (row['shopping_position'] as number | null | undefined) ?? null,
    updated_hlc: (row['updated_hlc'] as string) ?? '',
  }
}

function rowToTraveler(id: string, row: Record<string, unknown>): Traveler {
  return {
    id,
    trip_id: row['trip_id'] as string,
    name: row['name'] as string,
    linked_user_id: (row['linked_user_id'] as string) ?? null,
  }
}

function rowToMember(id: string, row: Record<string, unknown>): TripMember {
  return {
    id,
    trip_id: row['trip_id'] as string,
    user_id: row['user_id'] as string,
    role: (row['role'] as TripMember['role']) ?? 'editor',
  }
}

function rowToContainer(id: string, row: Record<string, unknown>): Container {
  return {
    id,
    trip_id: row['trip_id'] as string,
    name: row['name'] as string,
    carrier_traveler_id: (row['carrier_traveler_id'] as string) ?? null,
    max_weight_grams: (row['max_weight_grams'] as number) ?? null,
    paired_container_id: (row['paired_container_id'] as string) ?? null,
  }
}

export function rowToIdeaImage(id: string, row: Record<string, unknown>): IdeaImage {
  return {
    id,
    trip_id: row['trip_id'] as string,
    idea_id: row['idea_id'] as string,
    image_hash: row['image_hash'] as string,
    position: Number(row['position'] ?? 0),
  }
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

/** The columns every track shares, whatever it hangs on (FR-29.17). */
function rowToTrackFields(id: string, row: Record<string, unknown>): TrackFields {
  return {
    id,
    name: row['name'] as string,
    file_name: row['file_name'] as string,
    kind: row['kind'] === TRACK_KIND.bike ? TRACK_KIND.bike : TRACK_KIND.hike,
    with_kid: Boolean(row['with_kid']),
    pause_min: Number(row['pause_min'] ?? 0),
    position: Number(row['position'] ?? 0),
    gpx_hash: row['gpx_hash'] as string,
    distance_m: Number(row['distance_m'] ?? 0),
    ascent_m: nullableNumber(row['ascent_m']),
    descent_m: nullableNumber(row['descent_m']),
    max_ele_m: nullableNumber(row['max_ele_m']),
    point_count: Number(row['point_count'] ?? 0),
    line: (row['line'] as string) ?? '',
  }
}

export function rowToIdeaTrack(id: string, row: Record<string, unknown>): IdeaTrack {
  return {
    ...rowToTrackFields(id, row),
    trip_id: row['trip_id'] as string,
    idea_id: row['idea_id'] as string,
  }
}

function rowToExcursionTrack(id: string, row: Record<string, unknown>): ExcursionTrack {
  return {
    ...rowToTrackFields(id, row),
    trip_id: row['trip_id'] as string,
    excursion_id: row['excursion_id'] as string,
  }
}

function rowToComment(id: string, row: Record<string, unknown>): ItemComment {
  return {
    id,
    trip_id: row['trip_id'] as string,
    trip_item_id: (row['trip_item_id'] as string) ?? null,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    created_at: (row['created_at'] as string) ?? null,
    parent_id: (row['parent_id'] as string) ?? null,
    title: (row['title'] as string) ?? null,
    edited_at: (row['edited_at'] as string) ?? null,
    excursion_id: (row['excursion_id'] as string | null | undefined) ?? null,
  }
}

function rowToNoteAck(id: string, row: Record<string, unknown>): NoteAck {
  return {
    id,
    trip_id: row['trip_id'] as string,
    comment_id: row['comment_id'] as string,
    user_id: row['user_id'] as string,
    acked: Boolean(row['acked']),
    seen_through: (row['seen_through'] as string) ?? null,
  }
}

function rowToExcursion(id: string, row: Record<string, unknown>): Excursion {
  return {
    id,
    trip_id: row['trip_id'] as string,
    name: row['name'] as string,
    starts_on: (row['starts_on'] as string | null | undefined) ?? null,
    ends_on: (row['ends_on'] as string | null | undefined) ?? null,
    source_template_id: (row['source_template_id'] as string | null | undefined) ?? null,
    idea_id: (row['idea_id'] as string | null | undefined) ?? null,
  }
}

function rowToExcursionTraveler(id: string, row: Record<string, unknown>): ExcursionTraveler {
  return {
    id,
    trip_id: row['trip_id'] as string,
    excursion_id: row['excursion_id'] as string,
    traveler_id: row['traveler_id'] as string,
  }
}

function rowToExcursionItem(id: string, row: Record<string, unknown>): ExcursionItem {
  return {
    id,
    trip_id: row['trip_id'] as string,
    excursion_id: row['excursion_id'] as string,
    trip_item_id: (row['trip_item_id'] as string | null | undefined) ?? null,
    source_item_id: (row['source_item_id'] as string | null | undefined) ?? null,
    name: row['name'] as string,
    category_name: (row['category_name'] as string | null | undefined) ?? null,
    assigned_traveler_id: (row['assigned_traveler_id'] as string | null | undefined) ?? null,
    quantity: Number(row['quantity'] ?? 1),
    packed_count: Number(row['packed_count'] ?? 0),
    state: (row['state'] as ExcursionItem['state'] | undefined) ?? 'open',
    mode: (row['mode'] as ExcursionItem['mode'] | undefined) ?? ITEM_MODE_PACK,
    bought_at: (row['bought_at'] as string | null | undefined) ?? null,
    not_in_luggage: Boolean(row['not_in_luggage']),
    for_all_participants: Boolean(row['for_all_participants']),
    shopping_position: (row['shopping_position'] as number | null | undefined) ?? null,
  }
}

function rowToPrepTask(id: string, row: Record<string, unknown>): PrepTask {
  return {
    id,
    trip_id: row['trip_id'] as string,
    trip_item_id: row['trip_item_id'] as string,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    task_state: (row['task_state'] as PrepTask['task_state']) ?? 'open',
    ...taskFacts(row),
  }
}

/**
 * FR-7.7's five facts, read the same way for both kinds of task — they are
 * one table, and a second transcription is how the two kinds drift apart.
 */
function taskFacts(row: Record<string, unknown>): TaskFacts {
  return {
    task_tag_id: (row['task_tag_id'] as string | null | undefined) ?? null,
    phase: (row['phase'] as TaskPhase | null | undefined) ?? null,
    due_date: (row['due_date'] as string | null | undefined) ?? null,
    created_at: (row['created_at'] as string | null | undefined) ?? null,
    assignee_user_id: (row['assignee_user_id'] as string | null | undefined) ?? null,
    resolved_at: (row['resolved_at'] as string | null | undefined) ?? null,
    resolved_by_user_id: (row['resolved_by_user_id'] as string | null | undefined) ?? null,
    position: (row['position'] as number | null | undefined) ?? null,
  }
}

/**
 * Every kernel table, specified. A table no spec here or in a module's
 * `<m>/rows.ts` names is dropped on pull; `src/__tests__/moduleRows.spec.ts`
 * fails the build first, by composing both against `TABLE`.
 */
export const KERNEL_TABLE_SPECS = {
  [TABLE.tags]: { ...MASTER_DATA, parse: rowToTag },
  [TABLE.taskTags]: { ...MASTER_DATA, parse: rowToTaskTag },
  [TABLE.itemTags]: {
    ...MASTER_DATA,
    parse: rowToItemTag,
    cascadeParents: [goesWith('item_id', TABLE.items), goesWith('tag_id', TABLE.tags)],
  },
  [TABLE.items]: { ...MASTER_DATA, parse: rowToItem, encode: masterItemRow },
  [TABLE.itemDependencies]: {
    ...MASTER_DATA,
    parse: rowToDependency,
    encode: dependencyRow,
    cascadeParents: [goesWith('item_id', TABLE.items), goesWith('depends_on_item_id', TABLE.items)],
  },
  [TABLE.templates]: { ...MASTER_DATA, parse: rowToTemplate, encode: templateRow },
  [TABLE.templateItems]: {
    ...MASTER_DATA,
    parse: rowToTemplateItem,
    encode: templateItemRow,
    cascadeParents: [goesWith('template_id', TABLE.templates)],
  },
  [TABLE.templateIncludes]: {
    ...MASTER_DATA,
    parse: rowToInclude,
    // FR-27.1: an include goes with either side of the relation.
    cascadeParents: [
      goesWith('template_id', TABLE.templates),
      goesWith('included_template_id', TABLE.templates),
    ],
  },
  [TABLE.templateItemTasks]: {
    ...MASTER_DATA,
    parse: rowToTask,
    cascadeParents: [goesWith('template_item_id', TABLE.templateItems)],
  },
  [TABLE.templateTasks]: {
    ...MASTER_DATA,
    parse: rowToTemplateTask,
    cascadeParents: [goesWith('template_id', TABLE.templates)],
  },
  [TABLE.tripSeries]: { ...MASTER_DATA, parse: rowToSeries, encode: seriesRow },
  [TABLE.destinationProfiles]: {
    ...MASTER_DATA,
    parse: rowToProfile,
    encode: profileRow,
    cascadeParents: [goesWith('series_id', TABLE.tripSeries)],
  },
  [TABLE.destinationChecklistItems]: {
    ...MASTER_DATA,
    parse: rowToChecklistItem,
    encode: checklistItemRow,
    cascadeParents: [goesWith('profile_id', TABLE.destinationProfiles)],
  },
  [TABLE.trips]: { owner: 'trip', parse: rowToTrip, encode: tripRow },
  [TABLE.tripMembers]: { ...TRIP_ROWS, parse: rowToMember, encode: memberRow },
  [TABLE.tripTemplateSources]: {
    ...TRIP_ROWS,
    parse: rowToTemplateSource,
    // FR-27.4: a deleted group ends its registrations in the trips that used it.
    cascadeParents: alsoWith(goesWith('template_id', TABLE.templates)),
  },
  [TABLE.tripAppliedChanges]: { ...TRIP_ROWS, parse: rowToAppliedChange },
  [TABLE.tripItems]: { ...TRIP_ROWS, parse: rowToTripItem, encode: itemRow },
  [TABLE.travelers]: { ...TRIP_ROWS, parse: rowToTraveler, encode: travelerRow },
  [TABLE.containers]: { ...TRIP_ROWS, parse: rowToContainer, encode: containerRow },
  [TABLE.tripGeneratedPositions]: { ...TRIP_ROWS, parse: rowToGeneratedPosition },
  [TABLE.excursionTracks]: {
    ...TRIP_ROWS,
    parse: rowToExcursionTrack,
    encode: excursionTrackRow,
    cascadeParents: alsoWith(goesWith('excursion_id', TABLE.excursions)),
  },
  // FR-7.2: one table, two domain types. `is_task` decides which, and the
  // store routes on it — the codec named here is the plain comment, with the
  // preparation's beside it because a registry keyed by table cannot hold two.
  [TABLE.comments]: {
    ...TRIP_ROWS,
    parse: rowToComment,
    encode: commentRow,
    // A row's notes and FR-7.3 preparations go with it — a trip-level one carries a
    // null trip_item_id — and a first note takes its replies (FR-7.13).
    cascadeParents: alsoWith(
      goesWith('trip_item_id', TABLE.tripItems),
      goesWith('parent_id', TABLE.comments),
    ),
  },
  [TABLE.noteAcks]: {
    ...TRIP_ROWS,
    parse: rowToNoteAck,
    encode: noteAckRow,
    // FR-7.9: a tick goes with its note.
    cascadeParents: alsoWith(goesWith('comment_id', TABLE.comments)),
  },
  [TABLE.excursions]: { ...TRIP_ROWS, parse: rowToExcursion, encode: excursionRow },
  [TABLE.excursionTravelers]: {
    ...TRIP_ROWS,
    parse: rowToExcursionTraveler,
    encode: excursionTravelerRow,
    // FR-31.1/31.5: a participant goes with the excursion and with the traveller.
    cascadeParents: alsoWith(
      goesWith('excursion_id', TABLE.excursions),
      goesWith('traveler_id', TABLE.travelers),
    ),
  },
  [TABLE.excursionItems]: {
    ...TRIP_ROWS,
    parse: rowToExcursionItem,
    encode: excursionItemRow,
    // A line goes with its excursion and with the traveller it is for; the
    // packing row it came from is SET NULL, not a parent.
    cascadeParents: alsoWith(
      goesWith('excursion_id', TABLE.excursions),
      goesWith('assigned_traveler_id', TABLE.travelers),
    ),
  },
} satisfies Partial<Record<SyncTable, TableSpec>>

/**
 * The preparation half of `comments` (FR-7.2). It is not in `KERNEL_TABLE_SPECS` because
 * that map is keyed by table and this is the same table read as the other
 * type; `tripStore` picks between them on `is_task`. Being outside the map,
 * it is named by hand in `tableRegistry.spec.ts`'s pairs, as is
 * `ownTaskCodec`.
 */
export const prepTaskCodec: TableCodec<PrepTask> = { parse: rowToPrepTask, encode: prepTaskRow }

function rowToOwnTask(id: string, row: Record<string, unknown>): OwnTask {
  return {
    id,
    trip_id: row['trip_id'] as string,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    task_state: (row['task_state'] as OwnTask['task_state']) ?? 'open',
    ...taskFacts(row),
    idea_id: (row['idea_id'] as string | null | undefined) ?? null,
  }
}

/**
 * The FR-7.4 own task's codec — the third reading of a `comments` row,
 * chosen by `tripStore` when `is_task` is set and no row anchors it.
 */
export const ownTaskCodec: TableCodec<OwnTask> = { parse: rowToOwnTask, encode: ownTaskRow }

/**
 * encodedRow turns a stored row back into the row it travels as, by its
 * table's codec. A table without an encoder is one whose domain type *is* its
 * row (C-2), so a copy is the encoding.
 */
export function encodedRow(codec: TableCodec, value: unknown): SyncRow {
  const encode = codec.encode as ((v: unknown) => SyncRow) | undefined
  return encode ? encode(value) : { ...(value as SyncRow) }
}
