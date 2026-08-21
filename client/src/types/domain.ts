/** Client-side domain types — shaped from pull responses and DB schema. */

export type TripStatus = 'planning' | 'active' | 'archived'

/**
 * The trip statuses as values (§4a). `archived` in particular is switched on
 * across analytics, the review assistant and the FR-27.4 refresh, and a typo
 * in one of those compiles cleanly while silently never matching.
 */
export const TRIP_STATUS_PLANNING = 'planning' satisfies TripStatus
export const TRIP_STATUS_ACTIVE = 'active' satisfies TripStatus
export const TRIP_STATUS_ARCHIVED = 'archived' satisfies TripStatus

export interface Trip {
  id: string
  name: string
  status: TripStatus
  /**
   * The one required temporal fact (FR-2.1b). A trip is planned long
   * before its dates exist, and demanding a date meant inventing one.
   */
  year: number
  start_date: string | null
  end_date: string | null
  duration_days: number | null
  series_id: string | null
  series_name: string | null
  attributes: Record<string, unknown> | null
  imported: boolean
}

export type TripRole = 'owner' | 'admin' | 'editor'

/** One synced roster row (FR-4.5) — master partition since migration 009. */
export interface TripMember {
  id: string
  trip_id: string
  user_id: string
  role: TripRole
}

export interface TripParticipant {
  user_id: string
  display_name: string
  avatar_url: string | null
  role: TripRole
}

export type ItemState = 'open' | 'packing_now' | 'partial' | 'packed' | 'skipped'
export type ItemMode = 'pack' | 'buy_before' | 'buy_local'

export interface TripItem {
  id: string
  trip_id: string
  source_item_id: string | null
  source_template_id: string | null
  name: string
  weight_grams: number | null
  value_cents: number | null
  category_name: string | null
  quantity: number
  packed_count: number
  state: ItemState
  mode: ItemMode
  late_packer: boolean
  assigned_traveler_id: string | null
  /** Assignment — "Zugewiesen an", chosen deliberately (FR-25.19). */
  packer_user_id: string | null
  /** Record of who actually packed it; server-stamped, never picked (FR-25.19). */
  packed_by_user_id: string | null
  /**
   * When it was packed (FR-25.17). Null on rows packed before migration
   * 020 — the stamp then names the packer without a time rather than
   * inventing one.
   */
  packed_at: string | null
  container_id: string | null
  packing_now_by: string | null
  packing_now_at: string | null
  flag_unused: boolean
  flag_missing: boolean
  updated_hlc: string
}

/**
 * The two FR-9.1 trip-feedback flags. Named once because three layers
 * speak the same vocabulary: M5's control writes them, M14's proposals
 * are keyed by them, and M12 counts them.
 */
export type ReviewFlag = 'unused' | 'missing'

/**
 * The column each flag lives in — a serialization key, the documented
 * §4a carve-out, kept beside the type so the pair cannot drift.
 */
export const REVIEW_FLAG_FIELD = {
  unused: 'flag_unused',
  missing: 'flag_missing',
} as const satisfies Record<ReviewFlag, keyof Pick<TripItem, 'flag_unused' | 'flag_missing'>>

export type GroupBy = 'category' | 'container' | 'person' | 'status'

/** The axes M4's filter panel offers, in panel order (FR-25.11b). */
export type FacetKey = 'person' | 'category' | 'mode' | 'container' | 'flag'

/**
 * The selected values per facet (FR-25.11c). An empty array means *no
 * restriction on that axis*, never "show nothing". Values are strings
 * throughout so the whole filter survives a round trip through session
 * storage (FR-25.18).
 */
export type Facets = Record<FacetKey, string[]>

/** Computed stats for a trip's packing list. */
export interface TripKPIs {
  totalItems: number
  packedItems: number
  totalWeight: number
  packedWeight: number
  totalValue: number
  packedValue: number
  totalTodos: number
  resolvedTodos: number
}

export interface DashboardTrip {
  trip: Trip
  kpis: TripKPIs
  myItems: DashboardItem[]
  myItemCount: number
}

export interface DashboardItem {
  id: string
  name: string
  quantity: number
  packed: number
}

export interface Traveler {
  id: string
  trip_id: string
  name: string
  linked_user_id: string | null
}

export interface Container {
  id: string
  trip_id: string
  name: string
  carrier_traveler_id: string | null
  max_weight_grams: number | null
  /** Pairs two containers (e.g. left/right pannier) for FR-10.3 imbalance checks. */
  paired_container_id: string | null
}

// --- Comments (FR-7.1) ---

/**
 * A plain comment (comments row with is_task = 0). Flagging it as task
 * (FR-7.2) turns the same row into an ItemTodo. trip_item_id null means
 * the comment anchors to the trip itself.
 */
export interface ItemComment {
  id: string
  trip_id: string
  trip_item_id: string | null
  author_id: string
  body: string
  created_at: string | null
}

// --- Preparation Todos (FR-7.3) ---

export type TodoState = 'open' | 'resolved'

export interface ItemTodo {
  id: string
  trip_id: string
  trip_item_id: string
  author_id: string
  body: string
  task_state: TodoState
}

// --- Master data ---

/**
 * FR-24.1: a label an item can carry. Tags serve as categories *and* as
 * free-form labels — there is no separate taxonomy and no tag-management
 * screen; typing an unmatched name in M10 creates one (ADR-014).
 */
export interface Tag {
  id: string
  name: string
  sort_order: number
}

/**
 * FR-24.1: one item↔tag assignment. Its own row rather than a set on the
 * item, so two people tagging the same item offline both keep their edit
 * (NFR-4.2a merges per row, see ADR-014).
 */
export interface ItemTag {
  id: string
  item_id: string
  tag_id: string
  /** 0 = the item's *primary* tag, the single key M9 groups by (FR-24.2). */
  position: number
}

export interface MasterItem {
  id: string
  name: string
  /** Denormalised for display only — the trip row's grouping snapshot. */
  category_name?: string
  weight_grams: number | null
  value_cents: number | null
  /** FR-22.1: hash of the item's reference photo, null when it has none.
   * The bytes are fetched lazily via GET /items/{id}/image (never synced). */
  image_hash?: string | null
}

/**
 * FR-27.1/27.6: a template's scope, declared at creation and never derived
 * from usage — a freshly created group nothing includes yet would otherwise
 * be unclassifiable. `group` carries positions only and is includable;
 * `template` is a Ferien-Vorlage, the thing a trip starts from.
 */
export type TemplateKind = 'group' | 'template'

export interface Template {
  id: string
  /** FR-1.6 MVP: creator metadata only — every account may edit every
   * template, the same governance master items have (FR-22.6). */
  owner_id: string
  name: string
  kind: TemplateKind
}

/** FR-27.1: one (Ferien-Vorlage, Gruppe) pair — groups are referenced, never copied. */
export interface TemplateInclude {
  id: string
  template_id: string
  included_template_id: string
}

/**
 * FR-27.7: one free-text preparation task on a template position. At trip
 * generation each task becomes an ordinary FR-7.3 prep todo on the generated
 * trip item, so the "open prep blocks done" rule applies without a new flag.
 */
export interface TemplateItemTask {
  id: string
  template_item_id: string
  task: string
}

// --- Trip series & destination profiles (FR-13.1/13.2) ---

export interface TripSeries {
  id: string
  owner_id: string
  name: string
  default_attributes: Record<string, unknown> | null
}

export interface DestinationProfile {
  id: string
  series_id: string
  notes: string | null
}

export interface DestinationChecklistItem {
  id: string
  profile_id: string
  label: string
  mode: ItemMode
}

// --- Item dependencies / companion items (Addendum 3.20, FR-20.1) ---

export type DependencyMode = 'required' | 'suggested'

export interface ItemDependency {
  id: string
  /** The dependent companion (spare battery). */
  item_id: string
  /** The main item it belongs to (camera). */
  depends_on_item_id: string
  mode: DependencyMode
  /** Companion amount; null = 1. Plain number since FR-1.3/1.5 were retired. */
  quantity: number | null
}

export type TemplateAssignment = 'per_person' | 'trip_global'
export type TemplateDedup = 'max' | 'sum'

export interface TemplateItem {
  id: string
  template_id: string
  item_id: string
  item_name?: string
  /** Plain amount (FR-1.3/1.5 formulas retired 2026-08-08). */
  quantity: number
  assignment: TemplateAssignment
  dedup: TemplateDedup
  conditions: Record<string, unknown> | null
  default_mode: ItemMode
  late_packer: boolean
}

// --- The planning-trip refresh (FR-27.4, migration 023) ---

/**
 * FR-2.7: what a traveller change did to the trip's list, so the editor can
 * say it rather than let the user discover it. `kept` is the rows FR-27.4's
 * protection left standing — a row somebody had already packed or edited.
 */
export interface TravelerChangeReport {
  travelerId: string
  added: number
  removed: number
  kept: number
}

/** FR-27.4/27.10: one template a trip follows. Master partition. */
export interface TripTemplateSource {
  id: string
  trip_id: string
  template_id: string
}

/**
 * One ledger row: what generation last produced for a position. Its
 * identity is (trip, master item, traveler) — the same key
 * `generateTripItems` dedups on, so an item two groups both carry
 * (FR-27.2) is one entry rather than two competing ones.
 */
export interface GeneratedPosition {
  id: string
  trip_id: string
  /** The row it materialised as. Its *absence* means the user deleted it. */
  trip_item_id: string
  /** The first contributing template — what the log names, not part of the key. */
  source_template_id: string
  source_item_id: string
  /** '' for a trip-global position (FR-25.8 fan-out uses the traveler's id). */
  traveler_id: string
  name: string
  quantity: number
  mode: ItemMode
  late_packer: boolean
  weight_grams: number | null
  value_cents: number | null
  category_name: string | null
  /** FR-27.7 preparation tasks, as generation produced them. */
  tasks: string[]
}

export type AppliedChangeKind = 'added' | 'removed' | 'changed'

/** Which field a `changed` entry is about — the view words it (i18n). */
export type ChangedField =
  | 'quantity'
  | 'mode'
  | 'name'
  | 'late_packer'
  | 'weight_grams'
  | 'value_cents'
  | 'category_name'
  | 'tasks'

export interface ChangeDetail {
  field: ChangedField
  from: string | number | boolean | null
  to: string | number | boolean | null
}

/** One line of M2's applied-changes log (FR-27.4). Master partition. */
export interface AppliedChange {
  id: string
  trip_id: string
  source_template_id: string
  /** Denormalised: deleting the group must not rewrite the record of what it did. */
  source_template_name: string
  kind: AppliedChangeKind
  item_name: string
  detail: ChangeDetail | null
  created_at: string
}
