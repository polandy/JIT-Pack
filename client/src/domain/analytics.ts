/**
 * M12 analytics (FR-8.2/10.4/14.3) — pure, no I/O.
 *
 * Slices are keyed by exactly what M4's facets filter on — traveler id,
 * `category_name`, container id, `''` for the absence bucket — so a tapped
 * bar can become an FR-25.11 facet without translation. Weights: planned
 * is item weight × quantity, packed is weight × packed_count. An item
 * without weight metadata never enters a bar (a zero-width bar would read
 * as "weighs nothing"); it is counted once, honestly, beside the chart
 * (UI-Spec M12). Skipped items are out of scope everywhere (FR-5.5).
 *
 * Per-person items (FR-25.1) need no expansion here: each traveler's
 * instance is its own row carrying its own quantity and packed count, so
 * by Person the rows are one contribution each and by Category or
 * Container they sum back into a single bucket by construction.
 */

import type { Container, Traveler, Trip, TripItem } from '@/types/domain'
import { tripOrderKey } from './trips'

export type AnalyticsDimension = 'person' | 'category' | 'container'

export interface DimensionSlice {
  /** The M4 facet value this bar stands for ('' = the absence bucket). */
  key: string
  /** `null` for the absence bucket — the wording is UI copy (FR-25.11f). */
  label: string | null
  plannedWeight: number
  packedWeight: number
}

export interface TripAnalytics {
  /** Heaviest planned weight first. */
  slices: DimensionSlice[]
  plannedWeight: number
  packedWeight: number
  /** Over every non-skipped item, weighted or not. */
  totalValue: number
  /** Rows carrying no weight metadata, kept out of every bar. */
  unweightedCount: number
}

export function analyzeTrip(
  items: TripItem[],
  dimension: AnalyticsDimension,
  lookups: { travelers: Traveler[]; containers: Container[] },
): TripAnalytics {
  const slices = new Map<string, DimensionSlice>()
  let plannedWeight = 0
  let packedWeight = 0
  let totalValue = 0
  let unweightedCount = 0

  for (const item of items) {
    if (item.state === 'skipped') continue
    totalValue += (item.value_cents ?? 0) * item.quantity
    if (item.weight_grams === null) {
      unweightedCount++
      continue
    }
    const key = dimensionKey(item, dimension)
    let slice = slices.get(key)
    if (!slice) {
      slice = {
        key,
        label: dimensionLabel(key, dimension, lookups),
        plannedWeight: 0,
        packedWeight: 0,
      }
      slices.set(key, slice)
    }
    const planned = item.weight_grams * item.quantity
    const packed = item.weight_grams * item.packed_count
    slice.plannedWeight += planned
    slice.packedWeight += packed
    plannedWeight += planned
    packedWeight += packed
  }

  return {
    slices: [...slices.values()].sort((a, b) => b.plannedWeight - a.plannedWeight),
    plannedWeight,
    packedWeight,
    totalValue,
    unweightedCount,
  }
}

function dimensionKey(item: TripItem, dimension: AnalyticsDimension): string {
  switch (dimension) {
    case 'person':
      return item.assigned_traveler_id ?? ''
    case 'category':
      return item.category_name ?? ''
    case 'container':
      return item.container_id ?? ''
  }
}

function dimensionLabel(
  key: string,
  dimension: AnalyticsDimension,
  lookups: { travelers: Traveler[]; containers: Container[] },
): string | null {
  if (key === '') return null
  switch (dimension) {
    case 'person':
      return lookups.travelers.find((t) => t.id === key)?.name ?? key
    case 'container':
      return lookups.containers.find((c) => c.id === key)?.name ?? key
    case 'category':
      return key
  }
}

// --- Long-term trends (FR-14.3) ---

export interface SeriesTrendPoint {
  tripId: string
  tripName: string
  startDate: string | null
  packedWeight: number
}

/**
 * The weight actually carried on each of the series' archived trips,
 * oldest first — packed, not planned: an archived trip's plan is an
 * intention, the packed count is the record.
 */
export function seriesWeightTrend(
  trips: Trip[],
  itemsByTrip: (tripId: string) => TripItem[],
  seriesId: string,
): SeriesTrendPoint[] {
  return trips
    .filter((t) => t.status === 'archived' && t.series_id === seriesId)
    .sort((a, b) => tripOrderKey(a).localeCompare(tripOrderKey(b)))
    .map((t) => ({
      tripId: t.id,
      tripName: t.name,
      startDate: t.start_date,
      packedWeight: itemsByTrip(t.id)
        .filter((i) => i.state !== 'skipped')
        .reduce((sum, i) => sum + (i.weight_grams ?? 0) * i.packed_count, 0),
    }))
}

export interface SeriesFlag {
  name: string
  flag: 'missing' | 'unused'
  count: number
}

/**
 * The series' most frequently flagged items across its archived trips,
 * missing and unused in one list (the prototype's "Häufig markiert"),
 * counted per item-and-flag so "2× unused" and "1× missing" on the same
 * name stay two distinct findings.
 */
export function seriesTopFlagged(
  trips: Trip[],
  itemsByTrip: (tripId: string) => TripItem[],
  seriesId: string,
  limit = 5,
): SeriesFlag[] {
  const counts = new Map<string, SeriesFlag>()
  for (const trip of trips) {
    if (trip.status !== 'archived' || trip.series_id !== seriesId) continue
    for (const item of itemsByTrip(trip.id)) {
      for (const flag of ['missing', 'unused'] as const) {
        if (flag === 'missing' ? !item.flag_missing : !item.flag_unused) continue
        const key = `${flag}:${item.name}`
        const entry = counts.get(key) ?? { name: item.name, flag, count: 0 }
        entry.count++
        counts.set(key, entry)
      }
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}
