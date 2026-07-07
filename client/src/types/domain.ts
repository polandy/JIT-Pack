/** Client-side domain types — shaped from pull responses. */

export type TripStatus = 'planned' | 'active' | 'archived'

export interface Trip {
  id: string
  name: string
  status: TripStatus
  start_date: string | null
  end_date: string | null
  series_id: string | null
  series_name: string | null
  item_count: number
  packed_count: number
  /** Participant avatar URLs / initials for display. */
  participants: TripParticipant[]
}

export interface TripParticipant {
  user_id: string
  display_name: string
  avatar_url: string | null
}

export interface DashboardTrip {
  trip: Trip
  /** My open packing items (up to 3 for preview). */
  myItems: DashboardItem[]
  myItemCount: number
}

export interface DashboardItem {
  id: string
  name: string
  quantity: number
  packed: number
}
