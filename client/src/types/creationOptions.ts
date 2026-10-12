/**
 * The options a creating write is built from. They are named here, below both
 * the mutation factory that takes them and the portable import that hands
 * them over, so the import's port (`ImportMutations`) and the builders read
 * one declaration (ADR-096).
 */
import type { ItemMode, ShoppingMode, TripStatus } from './domain'

/** A master item's optional fields at creation. */
export interface MasterItemOptions {
  weightGrams?: number | null
  valueCents?: number | null
  /** FR-28.1: the optional mark, absent as often as not. */
  icon?: string | null
  /** FR-1.9: the account the item is normally assigned to. */
  defaultAssigneeId?: string | null
}

/** A template position's optional fields at creation. */
export interface TemplateItemOptions {
  quantity?: number
  assignment?: string
  dedup?: string
  defaultMode?: ItemMode
  latePacker?: boolean
  conditions?: Record<string, unknown> | null
}

/** A trip's optional fields at creation. */
export interface TripOptions {
  seriesId?: string | null
  attributes?: Record<string, unknown> | null
  /** FR-2.2: a restore gives back the status it saved (ADR-024). */
  status?: TripStatus
}

/** A container's optional fields at creation. */
export interface ContainerOptions {
  carrierTravelerId?: string | null
  maxWeightGrams?: number | null
}

/** A trip row as a portable document carries it (FR-18.4), every field decided. */
export interface PortableTripItemFields {
  name: string
  sourceItemId: string | null
  categoryName: string | null
  quantity: number
  packedCount: number
  mode: ItemMode
  latePacker: boolean
  /** FR-25.11j: the shopping list the row was bought from, if any. */
  boughtFrom: ShoppingMode | null
}
