/**
 * M12 analytics (FR-8.2/10.4/14.3) — pure, no I/O. Weights: planned is
 * item weight × quantity, packed is weight × packed_count. Items
 * without weight metadata are counted separately so totals stay honest
 * (UI-Spec M12). Skipped items are out of scope everywhere.
 */

import type { Container, Traveler, Trip, TripItem } from '@/types/domain'

export type AnalyticsDimension = 'person' | 'category' | 'container'

export interface DimensionSlice {
  /** Dimension value key ('' for unassigned/uncategorized). */
  key: string
  label: string
  plannedWeight: number
  packedWeight: number
  totalValue: number
  unweightedCount: number
  itemCount: number
}

export function analyzeByDimension(
  items: TripItem[],
  dimension: AnalyticsDimension,
  lookups: { travelers: Traveler[]; containers: Container[] },
): DimensionSlice[] {
  const slices = new Map<string, DimensionSlice>()

  for (const item of items) {
    if (item.state === 'skipped') continue
    const key = dimensionKey(item, dimension)
    let slice = slices.get(key)
    if (!slice) {
      slice = {
        key,
        label: dimensionLabel(key, dimension, lookups),
        plannedWeight: 0,
        packedWeight: 0,
        totalValue: 0,
        unweightedCount: 0,
        itemCount: 0,
      }
      slices.set(key, slice)
    }
    slice.itemCount++
    if (item.weight_grams === null) {
      slice.unweightedCount++
    } else {
      slice.plannedWeight += item.weight_grams * item.quantity
      slice.packedWeight += item.weight_grams * item.packed_count
    }
    slice.totalValue += (item.value_cents ?? 0) * item.quantity
  }

  return [...slices.values()].sort((a, b) => b.plannedWeight - a.plannedWeight)
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
): string {
  if (key === '') return dimension === 'category' ? 'Uncategorized' : 'Unassigned'
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
  plannedWeight: number
}

/** seriesWeightTrend: planned weight of a series' archived trips, oldest first. */
export function seriesWeightTrend(
  trips: Trip[],
  itemsByTrip: (tripId: string) => TripItem[],
  seriesId: string,
): SeriesTrendPoint[] {
  return trips
    .filter((t) => t.status === 'archived' && t.series_id === seriesId)
    .sort((a, b) => (a.start_date ?? a.end_date).localeCompare(b.start_date ?? b.end_date))
    .map((t) => ({
      tripId: t.id,
      tripName: t.name,
      startDate: t.start_date,
      plannedWeight: itemsByTrip(t.id)
        .filter((i) => i.state !== 'skipped')
        .reduce((sum, i) => sum + (i.weight_grams ?? 0) * i.quantity, 0),
    }))
}

export interface FlagCount {
  name: string
  count: number
}

/** topFlagged: most frequently Missing/Unused items across archived trips. */
export function topFlagged(
  trips: Trip[],
  itemsByTrip: (tripId: string) => TripItem[],
  flag: 'missing' | 'unused',
  limit = 5,
): FlagCount[] {
  const counts = new Map<string, number>()
  for (const trip of trips) {
    if (trip.status !== 'archived') continue
    for (const item of itemsByTrip(trip.id)) {
      const flagged = flag === 'missing' ? item.flag_missing : item.flag_unused
      if (flagged) {
        counts.set(item.name, (counts.get(item.name) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}
