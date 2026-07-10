/** Client-side domain types — shaped from pull responses and DB schema. */

export type TripStatus = 'planning' | 'active' | 'repack' | 'archived'

export interface Trip {
  id: string
  name: string
  status: TripStatus
  start_date: string | null
  end_date: string
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
  packer_user_id: string | null
  container_id: string | null
  packing_now_by: string | null
  packing_now_at: string | null
  flag_unused: boolean
  flag_missing: boolean
  updated_hlc: string
}

export type GroupBy = 'category' | 'container' | 'person' | 'status'

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
  profile: 'adult' | 'child'
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

export interface Category {
  id: string
  name: string
  sort_order: number
}

export type ItemUnit = 'pieces' | 'pairs' | 'per_day'

export interface MasterItem {
  id: string
  name: string
  category_id: string | null
  category_name?: string
  weight_grams: number | null
  value_cents: number | null
  is_consumable: boolean
  unit: ItemUnit
  per_day_rate: number | null
}

export interface Template {
  id: string
  owner_id: string
  name: string
  is_published: boolean
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
  quantity_formula: string | null
}

export type TemplateAssignment = 'per_person' | 'trip_global'
export type TemplateDedup = 'max' | 'sum'

export interface TemplateItem {
  id: string
  template_id: string
  item_id: string
  item_name?: string
  quantity_formula: string
  assignment: TemplateAssignment
  dedup: TemplateDedup
  conditions: Record<string, unknown> | null
  default_mode: ItemMode
  late_packer: boolean
}
