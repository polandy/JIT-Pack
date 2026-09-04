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
  Container,
  DestinationChecklistItem,
  DestinationProfile,
  ItemComment,
  ItemDependency,
  ItemTodo,
  MasterItem,
  Template,
  TemplateItem,
  Traveler,
  Trip,
  TripItem,
  TripMember,
  TripSeries,
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
    is_task: dbBool(false),
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

/** hashBlob mirrors the server's image_hash: the hex of the first 8 bytes
 * of the SHA-256 digest. Used in Local Mode, where there is no server to
 * stamp the change signal (FR-22 sync hint). */
export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// The base an optimistic row is rebuilt on, so every column the store keeps
// must appear here: a field left out is blanked until the next pull puts it
// back. That is how editing a weight used to drop the reference photo.
export function masterItemRow(item: MasterItem): Record<string, unknown> {
  return {
    name: item.name,
    weight_grams: item.weight_grams,
    value_cents: item.value_cents,
    image_hash: item.image_hash ?? null,
    icon: item.icon ?? null,
    retired_at: item.retired_at ?? null,
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
    flag_unused: dbBool(item.flag_unused),
    flag_missing: dbBool(item.flag_missing),
    updated_hlc: item.updated_hlc,
  }
}
