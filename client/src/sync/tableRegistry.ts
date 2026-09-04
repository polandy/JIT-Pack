/**
 * The table registry — one codec per syncable table.
 *
 * A row crosses this boundary twice: a pull hands the store a
 * `Record<string, unknown>` to turn into a domain object (`parse`), and an
 * optimistic write hands the outbox a domain object to turn back into a row
 * (`encode`). The two halves lived apart — twenty-one `rowTo*` functions
 * inside the two stores, fourteen builders in `composables/sync/rows.ts` —
 * and nothing compared them, which is how `trips.series_name` came to be
 * read by a parser that no writer, client or server, has ever filled.
 *
 * `TABLE_CODECS` is `satisfies Record<SyncTable, TableCodec>`, so a new
 * syncable table is a compile error until it has a parser, and
 * `__tests__/tableRegistry.spec.ts` holds the halves against each other.
 *
 * The encoders stay in `composables/sync/rows.ts` and are referenced from
 * here: eight action modules import them by name, and `rowBuilders.spec.ts`
 * already holds their completeness against the domain type. The parsers had
 * no consumer outside their own store, so they moved.
 */
import type {
  AppliedChange,
  Container,
  DestinationChecklistItem,
  DestinationProfile,
  GeneratedPosition,
  ItemComment,
  ItemDependency,
  ItemTag,
  ItemTodo,
  MasterItem,
  Tag,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
  TemplateKind,
  Traveler,
  Trip,
  TripItem,
  TripMember,
  TripSeries,
  TripTemplateSource,
} from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK } from '@/types/domain'
import { TABLE, type SyncTable } from '@/types/tables'
import { durationDays } from '@/domain/instantiate'
import { parseJsonColumn } from './columns'
import {
  checklistItemRow,
  commentRow,
  containerRow,
  dependencyRow,
  masterItemRow,
  memberRow,
  profileRow,
  seriesRow,
  templateItemRow,
  templateRow,
  todoRow,
  travelerRow,
  tripRow,
  itemRow,
} from '@/composables/sync/rows'

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

function rowToTag(id: string, row: Record<string, unknown>): Tag {
  return {
    id,
    name: row['name'] as string,
    sort_order: (row['sort_order'] as number) ?? 0,
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
    retired_at: (row['retired_at'] as string) ?? null,
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
    flag_unused: Boolean(row['flag_unused']),
    flag_missing: Boolean(row['flag_missing']),
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

function rowToComment(id: string, row: Record<string, unknown>): ItemComment {
  return {
    id,
    trip_id: row['trip_id'] as string,
    trip_item_id: (row['trip_item_id'] as string) ?? null,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    created_at: (row['created_at'] as string) ?? null,
  }
}

function rowToTodo(id: string, row: Record<string, unknown>): ItemTodo {
  return {
    id,
    trip_id: row['trip_id'] as string,
    trip_item_id: row['trip_item_id'] as string,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    task_state: (row['task_state'] as ItemTodo['task_state']) ?? 'open',
  }
}

/**
 * Every syncable table, paired. The `satisfies` is the point: adding a
 * `TABLE.*` constant without a codec fails the build rather than falling
 * through a switch that silently drops the row.
 */
export const TABLE_CODECS = {
  [TABLE.tags]: { parse: rowToTag },
  [TABLE.itemTags]: { parse: rowToItemTag },
  [TABLE.items]: { parse: rowToItem, encode: masterItemRow },
  [TABLE.itemDependencies]: { parse: rowToDependency, encode: dependencyRow },
  [TABLE.templates]: { parse: rowToTemplate, encode: templateRow },
  [TABLE.templateItems]: { parse: rowToTemplateItem, encode: templateItemRow },
  [TABLE.templateIncludes]: { parse: rowToInclude },
  [TABLE.templateItemTasks]: { parse: rowToTask },
  [TABLE.tripSeries]: { parse: rowToSeries, encode: seriesRow },
  [TABLE.destinationProfiles]: { parse: rowToProfile, encode: profileRow },
  [TABLE.destinationChecklistItems]: { parse: rowToChecklistItem, encode: checklistItemRow },
  [TABLE.trips]: { parse: rowToTrip, encode: tripRow },
  [TABLE.tripMembers]: { parse: rowToMember, encode: memberRow },
  [TABLE.tripTemplateSources]: { parse: rowToTemplateSource },
  [TABLE.tripAppliedChanges]: { parse: rowToAppliedChange },
  [TABLE.tripItems]: { parse: rowToTripItem, encode: itemRow },
  [TABLE.travelers]: { parse: rowToTraveler, encode: travelerRow },
  [TABLE.containers]: { parse: rowToContainer, encode: containerRow },
  [TABLE.tripGeneratedPositions]: { parse: rowToGeneratedPosition },
  // FR-7.2: one table, two domain types. `is_task` decides which, and the
  // store routes on it — the codec named here is the plain comment, with the
  // todo's beside it because a registry keyed by table cannot hold two.
  [TABLE.comments]: { parse: rowToComment, encode: commentRow },
} satisfies Record<SyncTable, TableCodec>

/**
 * The todo half of `comments` (FR-7.2). It is not in `TABLE_CODECS` because
 * that map is keyed by table and this is the same table read as the other
 * type; `tripStore` picks between them on `is_task`.
 */
export const todoCodec: TableCodec<ItemTodo> = { parse: rowToTodo, encode: todoRow }

/**
 * Where a store puts one table's rows. Two shapes cover every table: a
 * `Map` keyed by row id, and a `bucketedRows` map keyed by a parent id.
 *
 * The parameter is `never` so that a `RowSink<Tag>` may sit in a map of
 * sinks for every table; `applyToSink` is the one place that casts back.
 */
export interface RowSink<T = never> {
  set(row: T): void
  remove(id: string): void
}

/** The sinks a store offers, one per table it holds. */
export type RowSinks = Partial<Record<SyncTable, RowSink>>

/**
 * codecFor narrows a wire table name — `PullChange.table` is a plain string,
 * because the generated wire types describe what the server may send rather
 * than what this client knows. A name with no codec is a table this build
 * does not carry, and the caller drops the change.
 */
export function codecFor(table: string): { table: SyncTable; codec: TableCodec } | null {
  const codec = (TABLE_CODECS as Record<string, TableCodec | undefined>)[table]
  return codec ? { table: table as SyncTable, codec } : null
}

/**
 * applyToSink hands a parsed row to its table's sink. The cast is the price
 * of one map holding sinks of different row types; it is sound because
 * `TABLE_CODECS[table].parse` and the sink were declared for the same table,
 * and it is confined to this function.
 */
export function applyToSink(sinks: RowSinks, table: SyncTable, row: unknown): void {
  ;(sinks[table] as RowSink<unknown> | undefined)?.set(row)
}
