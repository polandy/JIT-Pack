/**
 * The optimistic row builders — one per synced entity, each rebuilding the
 * **whole** row an optimistic change is spread over.
 *
 * A builder that forgets a column blanks it: the store replaces the row
 * rather than merging into it, so an unrelated edit drops that column until
 * the next pull heals it — and in Local Mode no pull ever comes (PR #158).
 * Completeness is therefore held at compile time by
 * `composables/__tests__/rowBuilders.spec.ts`, whose fixtures carry
 * `satisfies Record<keyof T, unknown>`.
 */
import type {
  Meal,
  MealIngredient,
  Container,
  DestinationChecklistItem,
  DestinationProfile,
  ItemComment,
  ItemDependency,
  ItemTodo,
  NoteAck,
  Excursion,
  ExcursionItem,
  ExcursionTraveler,
  DayEntryTraveler,
  ShoppingEntry,
  TaskFacts,
  TripTodo,
  MasterItem,
  Template,
  TemplateItem,
  Traveler,
  Trip,
  TripItem,
  TripMember,
  TripSeries,
  DayEntry,
  Idea,
  IdeaComment,
  IdeaImage,
  IdeaTrack,
  ExcursionTrack,
  TrackFields,
  IdeaVote,
} from '@/types/domain'
import { dbBool, jsonColumn } from '@/sync/columns'

export function generateDeviceId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// The base an optimistic row is rebuilt on — see `masterItemRow`. No
// `duration_days`: the store derives it from the dates rather than keeping it.
export function tripRow(trip: Trip): Record<string, unknown> {
  return {
    name: trip.name,
    year: trip.year,
    status: trip.status,
    start_date: trip.start_date,
    end_date: trip.end_date,
    series_id: trip.series_id,
    attributes: jsonColumn(trip.attributes),
    packing_closed_at: trip.packing_closed_at,
    imported: dbBool(trip.imported),
  }
}

/** The base an optimistic row is rebuilt on — see `masterItemRow`. */
export function travelerRow(traveler: Traveler): Record<string, unknown> {
  return {
    trip_id: traveler.trip_id,
    name: traveler.name,
    linked_user_id: traveler.linked_user_id,
  }
}

export function seriesRow(series: TripSeries): Record<string, unknown> {
  return {
    owner_id: series.owner_id,
    name: series.name,
    default_attributes: jsonColumn(series.default_attributes),
  }
}

export function memberRow(member: TripMember): Record<string, unknown> {
  return {
    trip_id: member.trip_id,
    user_id: member.user_id,
    role: member.role,
  }
}

/**
 * A comment and a todo are the same row (FR-7.2), told apart by `is_task`
 * — which is why both mappers carry it: the store routes on that column,
 * so an optimistic row without it moves the row to the other list.
 */
export function commentRow(comment: ItemComment): Record<string, unknown> {
  return {
    trip_id: comment.trip_id,
    trip_item_id: comment.trip_item_id,
    author_id: comment.author_id,
    body: comment.body,
    created_at: comment.created_at,
    parent_id: comment.parent_id,
    title: comment.title,
    edited_at: comment.edited_at,
    excursion_id: comment.excursion_id,
    is_task: dbBool(false),
  }
}

/** FR-7.9: a note's tick. Own row per (comment, person) — see NoteAck. */
export function noteAckRow(ack: NoteAck): Record<string, unknown> {
  return {
    trip_id: ack.trip_id,
    comment_id: ack.comment_id,
    user_id: ack.user_id,
    acked: dbBool(ack.acked),
    seen_through: ack.seen_through,
  }
}

/** FR-31.1: an excursion. */
export function excursionRow(excursion: Excursion): Record<string, unknown> {
  return {
    trip_id: excursion.trip_id,
    name: excursion.name,
    starts_on: excursion.starts_on,
    ends_on: excursion.ends_on,
    source_template_id: excursion.source_template_id,
    idea_id: excursion.idea_id ?? null,
  }
}

/** FR-31.3: one participant of one excursion. */
export function excursionTravelerRow(row: ExcursionTraveler): Record<string, unknown> {
  return {
    trip_id: row.trip_id,
    excursion_id: row.excursion_id,
    traveler_id: row.traveler_id,
  }
}

/** FR-31.4: one line of an excursion's list. */
export function excursionItemRow(line: ExcursionItem): Record<string, unknown> {
  return {
    trip_id: line.trip_id,
    excursion_id: line.excursion_id,
    trip_item_id: line.trip_item_id,
    source_item_id: line.source_item_id,
    name: line.name,
    category_name: line.category_name,
    assigned_traveler_id: line.assigned_traveler_id,
    quantity: line.quantity,
    packed_count: line.packed_count,
    state: line.state,
    mode: line.mode,
    bought_at: line.bought_at,
    not_in_luggage: dbBool(line.not_in_luggage),
    for_all_participants: dbBool(line.for_all_participants),
    shopping_position: line.shopping_position ?? null,
  }
}

export function todoRow(todo: ItemTodo): Record<string, unknown> {
  return {
    trip_id: todo.trip_id,
    trip_item_id: todo.trip_item_id,
    author_id: todo.author_id,
    body: todo.body,
    is_task: dbBool(true),
    task_state: todo.task_state,
    ...taskFactRow(todo),
  }
}

/** tripTodoRow is `todoRow` without an anchor: FR-7.4's null `trip_item_id`. */
export function tripTodoRow(todo: TripTodo): Record<string, unknown> {
  return {
    trip_id: todo.trip_id,
    trip_item_id: null,
    author_id: todo.author_id,
    body: todo.body,
    is_task: dbBool(true),
    task_state: todo.task_state,
    ...taskFactRow(todo),
    idea_id: todo.idea_id ?? null,
  }
}

/**
 * FR-7.7's facts on the way back out. An optimistic row must carry them or
 * the store reads the merged row as a task with no phase and no record — the
 * line would lose its subtitle for as long as the push is in flight.
 */
function taskFactRow(task: TaskFacts): Record<string, unknown> {
  return {
    task_tag_id: task.task_tag_id,
    phase: task.phase,
    due_date: task.due_date,
    created_at: task.created_at,
    assignee_user_id: task.assignee_user_id,
    resolved_at: task.resolved_at,
    resolved_by_user_id: task.resolved_by_user_id,
    position: task.position ?? null,
  }
}

export function profileRow(profile: DestinationProfile): Record<string, unknown> {
  return {
    series_id: profile.series_id,
    notes: profile.notes,
  }
}

export function checklistItemRow(item: DestinationChecklistItem): Record<string, unknown> {
  return {
    profile_id: item.profile_id,
    label: item.label,
    mode: item.mode,
  }
}

export function containerRow(container: Container): Record<string, unknown> {
  return {
    trip_id: container.trip_id,
    name: container.name,
    carrier_traveler_id: container.carrier_traveler_id,
    max_weight_grams: container.max_weight_grams,
    paired_container_id: container.paired_container_id,
  }
}

/** FR-30.1: a shopping entry as its row. */
/** FR-29.1: an idea. */
export function ideaRow(idea: Idea): Record<string, unknown> {
  return {
    trip_id: idea.trip_id,
    author_id: idea.author_id,
    title: idea.title,
    note: idea.note,
    link: idea.link,
    tag: idea.tag,
    rain_proof: dbBool(idea.rain_proof),
    state: idea.state,
    created_at: idea.created_at,
    planned_on: idea.planned_on,
    planned_at: idea.planned_at,
  }
}

/** FR-29.15: an entry of the day plan's own. */
export function dayEntryRow(entry: DayEntry): Record<string, unknown> {
  return {
    trip_id: entry.trip_id,
    author_id: entry.author_id,
    kind: entry.kind,
    on_date: entry.on_date,
    at_time: entry.at_time,
    title: entry.title,
    note: entry.note,
    link: entry.link,
    legs: jsonColumn(entry.legs),
    excursion_id: entry.excursion_id ?? null,
    excursion_role: entry.excursion_role ?? null,
  }
}

/** FR-29.15: one traveller a day-plan entry is for. */
export function dayEntryTravelerRow(row: DayEntryTraveler): Record<string, unknown> {
  return {
    trip_id: row.trip_id,
    day_entry_id: row.day_entry_id,
    traveler_id: row.traveler_id,
  }
}

/** FR-33.1: a meal of the meal plan. */
export function mealRow(meal: Meal): Record<string, unknown> {
  return {
    trip_id: meal.trip_id,
    on_date: meal.on_date,
    slot: meal.slot,
    title: meal.title,
    kind: meal.kind,
    at_time: meal.at_time,
    note: meal.note,
    place: meal.place,
    cook_user_id: meal.cook_user_id,
    excursion_id: meal.excursion_id,
    excursion_packed_at: meal.excursion_packed_at,
  }
}

/** FR-33.2: an ingredient of a meal. */
export function mealIngredientRow(ingredient: MealIngredient): Record<string, unknown> {
  return {
    trip_id: ingredient.trip_id,
    meal_id: ingredient.meal_id,
    name: ingredient.name,
    amount: ingredient.amount,
    list: ingredient.list,
    position: ingredient.position,
    bought: dbBool(ingredient.bought),
    bought_at: ingredient.bought_at,
    bought_by_user_id: ingredient.bought_by_user_id,
    shopping_position: ingredient.shopping_position,
    fresh: ingredient.fresh === null ? null : dbBool(ingredient.fresh),
  }
}

/** FR-29.3: one person's vote on one idea. */
export function ideaVoteRow(vote: IdeaVote): Record<string, unknown> {
  return {
    trip_id: vote.trip_id,
    idea_id: vote.idea_id,
    user_id: vote.user_id,
    vote: vote.vote,
  }
}

/** FR-29.4: one entry of an idea's discussion. */
export function ideaCommentRow(comment: IdeaComment): Record<string, unknown> {
  return {
    trip_id: comment.trip_id,
    idea_id: comment.idea_id,
    author_id: comment.author_id,
    body: comment.body,
    created_at: comment.created_at,
    edited_at: comment.edited_at,
  }
}

export function ideaImageRow(image: IdeaImage): Record<string, unknown> {
  return {
    trip_id: image.trip_id,
    idea_id: image.idea_id,
    image_hash: image.image_hash,
    position: image.position,
  }
}

/** The columns every track shares, whatever it hangs on (FR-29.17). */
function trackFieldsRow(track: TrackFields): Record<string, unknown> {
  return {
    name: track.name,
    file_name: track.file_name,
    kind: track.kind,
    with_kid: dbBool(track.with_kid),
    pause_min: track.pause_min,
    position: track.position,
    gpx_hash: track.gpx_hash,
    distance_m: track.distance_m,
    ascent_m: track.ascent_m,
    descent_m: track.descent_m,
    max_ele_m: track.max_ele_m,
    point_count: track.point_count,
    line: track.line,
  }
}

/** FR-29.17: a GPX track on an idea — every column, as an optimistic row is rebuilt on. */
export function ideaTrackRow(track: IdeaTrack): Record<string, unknown> {
  return {
    trip_id: track.trip_id,
    idea_id: track.idea_id,
    ...trackFieldsRow(track),
  }
}

/** FR-31.15: a GPX track on an excursion, the same way. */
export function excursionTrackRow(track: ExcursionTrack): Record<string, unknown> {
  return {
    trip_id: track.trip_id,
    excursion_id: track.excursion_id,
    ...trackFieldsRow(track),
  }
}

export function shoppingEntryRow(entry: ShoppingEntry): Record<string, unknown> {
  return {
    trip_id: entry.trip_id,
    name: entry.name,
    list: entry.list,
    bought: dbBool(entry.bought),
    tag: entry.tag,
    bought_at: entry.bought_at,
    bought_by_user_id: entry.bought_by_user_id,
    due_date: entry.due_date,
    assignee_user_id: entry.assignee_user_id,
    carried_over_at: entry.carried_over_at ?? null,
    position: entry.position ?? null,
    idea_id: entry.idea_id ?? null,
  }
}

/** The hex of the first 8 bytes of the SHA-256 digest — the server's image_hash. */
async function sha256Prefix(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const U64 = (1n << 64n) - 1n

/** FNV-1a over 64 bits: a change marker, not a digest anything verifies. */
function fnv1a64(bytes: ArrayBuffer): string {
  let hash = FNV_OFFSET
  for (const byte of new Uint8Array(bytes)) hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & U64
  return hash.toString(16).padStart(16, '0')
}

/**
 * hashBlob is the Local Mode image hash (FR-22, FR-29.5): where there is no
 * server to stamp the change signal, this device does. It is the server's
 * SHA-256 prefix where the browser offers one, and FNV-1a on a plain-HTTP
 * origin, which has no `crypto.subtle` (E2E-NFR-SEC-01's LAN instance) —
 * nothing compares the two, since a server stamps its own on upload.
 */
export async function hashBlob(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer()
  return globalThis.crypto?.subtle ? sha256Prefix(bytes) : fnv1a64(bytes)
}

// The base an optimistic row is rebuilt on, so every column the store keeps
// must appear here: a field left out is blanked until the next pull puts it
// back — editing a weight would drop the reference photo.
export function masterItemRow(item: MasterItem): Record<string, unknown> {
  return {
    name: item.name,
    weight_grams: item.weight_grams,
    value_cents: item.value_cents,
    image_hash: item.image_hash ?? null,
    icon: item.icon ?? null,
    default_assignee_id: item.default_assignee_id ?? null,
    retired_at: item.retired_at ?? null,
    merged_into_id: item.merged_into_id ?? null,
  }
}

export function templateRow(template: Template): Record<string, unknown> {
  return {
    owner_id: template.owner_id,
    name: template.name,
    kind: template.kind,
    icon: template.icon ?? null,
    retired_at: template.retired_at ?? null,
  }
}

export function templateItemRow(ti: TemplateItem): Record<string, unknown> {
  return {
    template_id: ti.template_id,
    item_id: ti.item_id,
    quantity: ti.quantity,
    assignment: ti.assignment,
    dedup: ti.dedup,
    conditions: jsonColumn(ti.conditions),
    default_mode: ti.default_mode,
    late_packer: dbBool(ti.late_packer),
  }
}

export function dependencyRow(d: ItemDependency): Record<string, unknown> {
  return {
    item_id: d.item_id,
    depends_on_item_id: d.depends_on_item_id,
    mode: d.mode,
    quantity: d.quantity,
  }
}

/**
 * The row an optimistic update carries, and it must be *complete*: both
 * the store and IndexedDB put the whole row rather than patching it, so a
 * column missing here is a column erased from the device — permanently in
 * Local Mode, where no pull ever restores it. `source_template_id` was
 * exactly that: one M5 edit detached a generated row from the group it
 * came from, and FR-27.4, FR-27.5 and M14 all read that provenance.
 */
export function itemRow(item: TripItem): Record<string, unknown> {
  return {
    trip_id: item.trip_id,
    name: item.name,
    source_item_id: item.source_item_id,
    source_template_id: item.source_template_id,
    weight_grams: item.weight_grams,
    value_cents: item.value_cents,
    category_name: item.category_name,
    quantity: item.quantity,
    packed_count: item.packed_count,
    state: item.state,
    mode: item.mode,
    late_packer: dbBool(item.late_packer),
    assigned_traveler_id: item.assigned_traveler_id,
    packer_user_id: item.packer_user_id,
    packed_by_user_id: item.packed_by_user_id,
    packed_at: item.packed_at,
    container_id: item.container_id,
    packing_now_by: item.packing_now_by,
    packing_now_at: item.packing_now_at,
    bought_from: item.bought_from,
    bought_at: item.bought_at,
    bought_by_user_id: item.bought_by_user_id,
    flag_unused: dbBool(item.flag_unused),
    flag_missing: dbBool(item.flag_missing),
    carried_over_at: item.carried_over_at ?? null,
    shopping_position: item.shopping_position ?? null,
    updated_hlc: item.updated_hlc,
  }
}
