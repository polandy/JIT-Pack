/**
 * M12 analytics (FR-8.2/10.4/14.3) — pure derivations: dimensional
 * weight/value slices with an honest "unweighted" bucket, per-series
 * weight trends, and most-flagged items across the history.
 */
import { describe, expect, it } from 'vitest'

import { analyzeByDimension, seriesWeightTrend, topFlagged } from '../analytics'
import type { Container, Traveler, Trip, TripItem } from '@/types/domain'

function item(overrides: Partial<TripItem>): TripItem {
  return {
    id: crypto.randomUUID(),
    trip_id: 't1',
    source_item_id: null,
    source_template_id: null,
    name: 'Item',
    weight_grams: 100,
    value_cents: null,
    category_name: null,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '',
    ...overrides,
  }
}

function trip(id: string, overrides: Partial<Trip> = {}): Trip {
  return {
    id,
    name: id,
    status: 'archived',
    start_date: '2026-07-01',
    end_date: '2026-07-10',
    duration_days: 10,
    series_id: 's1',
    series_name: null,
    attributes: null,
    imported: false,
    ...overrides,
  }
}

const travelers: Traveler[] = [
  { id: 'trav-1', trip_id: 't1', name: 'Andy', profile: 'adult', linked_user_id: null },
]
const containers: Container[] = [
  {
    id: 'c1',
    trip_id: 't1',
    name: 'Left Pannier',
    carrier_traveler_id: null,
    max_weight_grams: null,
    paired_container_id: null,
  },
]

describe('analyzeByDimension (FR-8.2)', () => {
  const items = [
    item({
      category_name: 'Kleidung',
      weight_grams: 200,
      quantity: 3,
      packed_count: 1,
      value_cents: 1000,
    }),
    item({ category_name: 'Kleidung', weight_grams: null, value_cents: null }),
    item({
      category_name: 'Technik',
      weight_grams: 500,
      quantity: 1,
      packed_count: 1,
      value_cents: 90000,
    }),
    item({ category_name: 'Technik', state: 'skipped', quantity: 0, weight_grams: 999 }),
  ]

  it('slices by category with planned/packed weight, value, and unweighted count', () => {
    const slices = analyzeByDimension(items, 'category', { travelers, containers })

    expect(slices.map((s) => s.label)).toEqual(['Kleidung', 'Technik'])
    const kleidung = slices[0]
    expect(kleidung).toMatchObject({
      plannedWeight: 600,
      packedWeight: 200,
      totalValue: 3000,
      unweightedCount: 1,
      itemCount: 2,
    })
    const technik = slices[1]!
    expect(technik.plannedWeight).toBe(500) // skipped item excluded
    expect(technik.totalValue).toBe(90000)
  })

  it('resolves person and container labels via lookups (FR-10.4)', () => {
    const assigned = [
      item({ assigned_traveler_id: 'trav-1', container_id: 'c1', weight_grams: 300 }),
      item({ weight_grams: 100 }),
    ]

    const byPerson = analyzeByDimension(assigned, 'person', { travelers, containers })
    expect(byPerson.map((s) => s.label)).toEqual(['Andy', 'Unassigned'])

    const byContainer = analyzeByDimension(assigned, 'container', { travelers, containers })
    expect(byContainer.map((s) => s.label)).toEqual(['Left Pannier', 'Unassigned'])
  })
})

describe('seriesWeightTrend (FR-14.3)', () => {
  it('orders archived series trips chronologically with their planned weight', () => {
    const trips = [
      trip('t2025', { start_date: '2025-07-01', end_date: '2025-07-08', name: 'Engadin 2025' }),
      trip('t2024', { start_date: '2024-07-01', end_date: '2024-07-08', name: 'Engadin 2024' }),
      trip('t-active', { status: 'active' }),
      trip('t-other-series', { series_id: 's2' }),
    ]
    const itemsByTrip = (id: string) =>
      id === 't2024'
        ? [item({ trip_id: id, weight_grams: 1000 })]
        : [item({ trip_id: id, weight_grams: 2000 })]

    const trend = seriesWeightTrend(trips, itemsByTrip, 's1')

    expect(trend.map((t) => t.tripName)).toEqual(['Engadin 2024', 'Engadin 2025'])
    expect(trend.map((t) => t.plannedWeight)).toEqual([1000, 2000])
  })
})

describe('topFlagged (FR-14.3)', () => {
  it('counts flags across archived trips only, most frequent first', () => {
    const trips = [trip('a1'), trip('a2'), trip('active', { status: 'active' })]
    const itemsByTrip = (id: string) => {
      if (id === 'a1')
        return [
          item({ trip_id: id, name: 'Sonnencreme', flag_missing: true }),
          item({ trip_id: id, name: 'Ladekabel', flag_missing: true }),
        ]
      if (id === 'a2') return [item({ trip_id: id, name: 'Sonnencreme', flag_missing: true })]
      return [item({ trip_id: id, name: 'Aktiv', flag_missing: true })]
    }

    const top = topFlagged(trips, itemsByTrip, 'missing')

    expect(top).toEqual([
      { name: 'Sonnencreme', count: 2 },
      { name: 'Ladekabel', count: 1 },
    ])
  })
})
