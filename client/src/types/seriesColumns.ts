/**
 * Trip series & destination profiles (FR-13.1/13.2/13.4) — kept out of
 * `domain.ts` for its size.
 */

import type { ItemMode } from './domain'

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

/** FR-13.4: a task the destination profile carries, on every trip of the series. */
export interface DestinationTask {
  id: string
  profile_id: string
  task: string
  /** A lead before the trip's start, or null for no due day (ADR-106). */
  lead_days: number | null
  /** G-8: null in Local and Single-User Mode, which store no seat. */
  assignee_user_id: string | null
}
