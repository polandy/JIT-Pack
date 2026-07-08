/** Client-side domain types — shaped from pull responses and DB schema. */

export type TripStatus = 'planning' | 'active' | 'repack' | 'archived'

export interface Trip {
  id: string
  name: string
  status: TripStatus
  start_date: string
  end_date: string
  duration_days: number
  series_id: string | null
  series_name: string | null
  attributes: Record<string, unknown> | null
  imported: boolean
}

export type TripRole = 'owner' | 'admin' | 'editor'

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
