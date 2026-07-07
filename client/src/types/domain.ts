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

export interface TripParticipant {
  user_id: string
  display_name: string
  avatar_url: string | null
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
