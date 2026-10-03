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
import { TRACK_KIND } from '@/api/types'
import type {
  AppliedChange,
  ConnectionLeg,
  Container,
  DestinationChecklistItem,
  DestinationProfile,
  GeneratedPosition,
  ItemComment,
  ItemDependency,
  ItemTag,
  ItemTodo,
  NoteAck,
  Excursion,
  ExcursionItem,
  ExcursionTraveler,
  DayEntry,
  Idea,
  IdeaComment,
  IdeaImage,
  IdeaTrack,
  ExcursionTrack,
  TrackFields,
  IdeaVote,
  ShoppingEntry,
  TaskFacts,
  TaskTag,
  TaskPhase,
  TripTodo,
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
import {
  DAY_ENTRY_CONNECTION,
  DAY_ENTRY_NOTE,
  IDEA_STATE_IDEA,
  ITEM_MODE_BUY_LOCAL,
  ITEM_MODE_PACK,
  toIdeaTag,
} from '@/types/domain'
import { TABLE, type SyncTable } from '@/types/tables'
import { durationDays } from '@/domain/instantiate'
import { parseJsonColumn } from './columns'
import {
  checklistItemRow,
  commentRow,
  containerRow,
  shoppingEntryRow,
  dependencyRow,
  masterItemRow,
  memberRow,
  noteAckRow,
  excursionRow,
  excursionTravelerRow,
  excursionItemRow,
  dayEntryRow,
  ideaCommentRow,
  ideaImageRow,
  ideaTrackRow,
  excursionTrackRow,
  ideaRow,
  ideaVoteRow,
  profileRow,
  seriesRow,
  templateItemRow,
  templateRow,
  todoRow,
  tripTodoRow,
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

function rowToShoppingEntry(id: string, row: Record<string, unknown>): ShoppingEntry {
  return {
    id,
    trip_id: row['trip_id'] as string,
    name: row['name'] as string,
    list: (row['list'] as ShoppingEntry['list']) ?? ITEM_MODE_BUY_LOCAL,
    bought: Boolean(row['bought']),
    tag: (row['tag'] as string) ?? null,
    bought_at: (row['bought_at'] as string) ?? null,
    bought_by_user_id: (row['bought_by_user_id'] as string) ?? null,
    due_date: (row['due_date'] as string | null | undefined) ?? null,
    assignee_user_id: (row['assignee_user_id'] as string | null | undefined) ?? null,
    carried_over_at: (row['carried_over_at'] as string | null | undefined) ?? null,
    position: (row['position'] as number | null | undefined) ?? null,
    idea_id: (row['idea_id'] as string | null | undefined) ?? null,
  }
}

function rowToIdea(id: string, row: Record<string, unknown>): Idea {
  return {
    id,
    trip_id: row['trip_id'] as string,
    author_id: row['author_id'] as string,
    title: row['title'] as string,
    note: (row['note'] as string) ?? null,
    link: (row['link'] as string) ?? null,
    tag: toIdeaTag(row['tag']),
    rain_proof: Boolean(row['rain_proof']),
    state: (row['state'] as Idea['state']) ?? IDEA_STATE_IDEA,
    created_at: (row['created_at'] as string) ?? null,
    planned_on: (row['planned_on'] as string) ?? null,
    planned_at: (row['planned_at'] as string) ?? null,
  }
}

function rowToDayEntry(id: string, row: Record<string, unknown>): DayEntry {
  return {
    id,
    trip_id: row['trip_id'] as string,
    author_id: row['author_id'] as string,
    kind: row['kind'] === DAY_ENTRY_CONNECTION ? DAY_ENTRY_CONNECTION : DAY_ENTRY_NOTE,
    on_date: row['on_date'] as string,
    at_time: (row['at_time'] as string) ?? null,
    title: row['title'] as string,
    note: (row['note'] as string) ?? null,
    link: (row['link'] as string) ?? null,
    legs: parseLegs(row['legs']),
    excursion_id: (row['excursion_id'] as string) ?? null,
  }
}

/**
 * FR-29.18: a connection's legs from their JSON column. Anything that is not
 * a list of legs reads as none, so a malformed row is an entry without legs
 * rather than a screen that cannot render.
 */
function parseLegs(raw: unknown): ConnectionLeg[] | null {
  const parsed = parseJsonColumn<unknown>(raw, null)
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isLeg)) return null
  return parsed
}

function isLeg(value: unknown): value is ConnectionLeg {
  if (typeof value !== 'object' || value === null) return false
  const leg = value as Record<string, unknown>
  return (['from', 'to', 'dep', 'arr', 'line'] as const).every(
    (key) => typeof leg[key] === 'string',
  )
}

function rowToIdeaVote(id: string, row: Record<string, unknown>): IdeaVote {
  return {
    id,
    trip_id: row['trip_id'] as string,
    idea_id: row['idea_id'] as string,
    user_id: row['user_id'] as string,
    vote: (row['vote'] as IdeaVote['vote']) ?? null,
  }
}

function rowToIdeaComment(id: string, row: Record<string, unknown>): IdeaComment {
  return {
    id,
    trip_id: row['trip_id'] as string,
    idea_id: row['idea_id'] as string,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    created_at: (row['created_at'] as string) ?? null,
    edited_at: (row['edited_at'] as string) ?? null,
  }
}

function rowToIdeaImage(id: string, row: Record<string, unknown>): IdeaImage {
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

function rowToIdeaTrack(id: string, row: Record<string, unknown>): IdeaTrack {
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

function rowToTodo(id: string, row: Record<string, unknown>): ItemTodo {
  return {
    id,
    trip_id: row['trip_id'] as string,
    trip_item_id: row['trip_item_id'] as string,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    task_state: (row['task_state'] as ItemTodo['task_state']) ?? 'open',
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
 * Every syncable table, paired. The `satisfies` is the point: adding a
 * `TABLE.*` constant without a codec fails the build rather than falling
 * through a switch that silently drops the row.
 */
export const TABLE_CODECS = {
  [TABLE.tags]: { parse: rowToTag },
  [TABLE.taskTags]: { parse: rowToTaskTag },
  [TABLE.itemTags]: { parse: rowToItemTag },
  [TABLE.items]: { parse: rowToItem, encode: masterItemRow },
  [TABLE.itemDependencies]: { parse: rowToDependency, encode: dependencyRow },
  [TABLE.templates]: { parse: rowToTemplate, encode: templateRow },
  [TABLE.templateItems]: { parse: rowToTemplateItem, encode: templateItemRow },
  [TABLE.templateIncludes]: { parse: rowToInclude },
  [TABLE.templateItemTasks]: { parse: rowToTask },
  [TABLE.templateTasks]: { parse: rowToTemplateTask },
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
  [TABLE.shoppingEntries]: { parse: rowToShoppingEntry, encode: shoppingEntryRow },
  [TABLE.ideas]: { parse: rowToIdea, encode: ideaRow },
  [TABLE.ideaVotes]: { parse: rowToIdeaVote, encode: ideaVoteRow },
  [TABLE.ideaComments]: { parse: rowToIdeaComment, encode: ideaCommentRow },
  [TABLE.ideaImages]: { parse: rowToIdeaImage, encode: ideaImageRow },
  [TABLE.dayEntries]: { parse: rowToDayEntry, encode: dayEntryRow },
  [TABLE.ideaTracks]: { parse: rowToIdeaTrack, encode: ideaTrackRow },
  [TABLE.excursionTracks]: { parse: rowToExcursionTrack, encode: excursionTrackRow },
  // FR-7.2: one table, two domain types. `is_task` decides which, and the
  // store routes on it — the codec named here is the plain comment, with the
  // todo's beside it because a registry keyed by table cannot hold two.
  [TABLE.comments]: { parse: rowToComment, encode: commentRow },
  [TABLE.noteAcks]: { parse: rowToNoteAck, encode: noteAckRow },
  [TABLE.excursions]: { parse: rowToExcursion, encode: excursionRow },
  [TABLE.excursionTravelers]: { parse: rowToExcursionTraveler, encode: excursionTravelerRow },
  [TABLE.excursionItems]: { parse: rowToExcursionItem, encode: excursionItemRow },
} satisfies Record<SyncTable, TableCodec>

/**
 * The todo half of `comments` (FR-7.2). It is not in `TABLE_CODECS` because
 * that map is keyed by table and this is the same table read as the other
 * type; `tripStore` picks between them on `is_task`.
 */
export const todoCodec: TableCodec<ItemTodo> = { parse: rowToTodo, encode: todoRow }

function rowToTripTodo(id: string, row: Record<string, unknown>): TripTodo {
  return {
    id,
    trip_id: row['trip_id'] as string,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    task_state: (row['task_state'] as TripTodo['task_state']) ?? 'open',
    ...taskFacts(row),
    idea_id: (row['idea_id'] as string | null | undefined) ?? null,
  }
}

/**
 * The FR-7.4 trip todo's codec — the third reading of a `comments` row,
 * chosen by `tripStore` when `is_task` is set and no row anchors it.
 */
export const tripTodoCodec: TableCodec<TripTodo> = { parse: rowToTripTodo, encode: tripTodoRow }

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
