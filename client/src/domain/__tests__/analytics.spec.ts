/**
 * M12 analytics (FR-8.2/10.4/14.3) — pure derivations: dimensional
 * weight slices whose keys are M4's facet values, honest trip totals
 * with an "unweighted" count, per-series packed-weight trends, and the
 * series' most-flagged items.
 */
import { describe, expect, it } from 'vitest'

import { analyzeTrip, seriesTopFlagged, seriesWeightTrend } from '../analytics'
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
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    bought_from: null,
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
    year: 2026,
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
  { id: 'trav-1', trip_id: 't1', name: 'Andy', linked_user_id: null },
  { id: 'trav-2', trip_id: 't1', name: 'Sia', linked_user_id: null },
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

describe('analyzeTrip (FR-8.2)', () => {
  const items = [
    item({
      category_name: 'Kleidung',
      weight_grams: 200,
      quantity: 3,
      packed_count: 1,
      value_cents: 1000,
    }),
    item({ category_name: 'Kleidung', weight_grams: null, value_cents: 500 }),
    item({
      category_name: 'Technik',
      weight_grams: 500,
      quantity: 1,
      packed_count: 1,
      value_cents: 90000,
    }),
    item({ category_name: 'Technik', state: 'skipped', quantity: 0, weight_grams: 999 }),
  ]

  it('slices by category with planned/packed weight, heaviest first', () => {
    const { slices } = analyzeTrip(items, 'category', { travelers, containers })

    expect(slices.map((s) => s.label)).toEqual(['Kleidung', 'Technik'])
    expect(slices[0]).toMatchObject({ key: 'Kleidung', plannedWeight: 600, packedWeight: 200 })
    // The skipped item is out of scope everywhere (FR-5.5).
    expect(slices[1]).toMatchObject({ key: 'Technik', plannedWeight: 500, packedWeight: 500 })
  })

  it('totals weight and value over the trip; unweighted items count value but never weight', () => {
    const { plannedWeight, packedWeight, totalValue, unweightedCount } = analyzeTrip(
      items,
      'category',
      { travelers, containers },
    )

    expect(plannedWeight).toBe(1100)
    expect(packedWeight).toBe(700)
    // 3×1000 + 1×500 + 1×90000; the skipped item's value stays out.
    expect(totalValue).toBe(93500)
    expect(unweightedCount).toBe(1)
  })

  it('keeps an unweighted item out of the bars — a zero-width bar would read as "weighs nothing"', () => {
    const { slices } = analyzeTrip(
      [item({ category_name: 'Papiere', weight_grams: null })],
      'category',
      { travelers, containers },
    )

    expect(slices).toEqual([])
  })

  it('keys slices by what M4 filters on — ids for person and container, the name for category', () => {
    const assigned = [
      item({ assigned_traveler_id: 'trav-1', container_id: 'c1', weight_grams: 300 }),
      item({ weight_grams: 100 }),
    ]

    const byPerson = analyzeTrip(assigned, 'person', { travelers, containers }).slices
    expect(byPerson.map((s) => [s.key, s.label])).toEqual([
      ['trav-1', 'Andy'],
      ['', null],
    ])

    const byContainer = analyzeTrip(assigned, 'container', { travelers, containers }).slices
    expect(byContainer.map((s) => [s.key, s.label])).toEqual([
      ['c1', 'Left Pannier'],
      ['', null],
    ])
  })

  /**
   * FR-25.1: a per-person item is one row per traveler, each with its own
   * quantity and packed count. By Person that is one contribution each and
   * never an `undefined` bucket; by Category the rows sum back into a
   * single bucket, so the totals match across dimensions (E2E-M12-05).
   */
  it('expands a per-person item into one contribution per traveler, summing back by category', () => {
    const perPerson = [
      item({
        source_item_id: 'sunglasses',
        category_name: 'Kleidung',
        assigned_traveler_id: 'trav-1',
        weight_grams: 30,
        packed_count: 1,
      }),
      item({
        source_item_id: 'sunglasses',
        category_name: 'Kleidung',
        assigned_traveler_id: 'trav-2',
        weight_grams: 30,
      }),
    ]

    const byPerson = analyzeTrip(perPerson, 'person', { travelers, containers })
    expect(byPerson.slices.map((s) => [s.label, s.plannedWeight, s.packedWeight])).toEqual([
      ['Andy', 30, 30],
      ['Sia', 30, 0],
    ])

    const byCategory = analyzeTrip(perPerson, 'category', { travelers, containers })
    expect(byCategory.slices).toHaveLength(1)
    expect(byCategory.slices[0]).toMatchObject({ plannedWeight: 60, packedWeight: 30 })
    expect(byCategory.plannedWeight).toBe(byPerson.plannedWeight)
  })
})

describe('seriesWeightTrend (FR-14.3)', () => {
  it('orders archived series trips chronologically with the weight actually packed', () => {
    const trips = [
      trip('t2025', { start_date: '2025-07-01', end_date: '2025-07-08', name: 'Engadin 2025' }),
      trip('t2024', { start_date: '2024-07-01', end_date: '2024-07-08', name: 'Engadin 2024' }),
      trip('t-active', { status: 'active' }),
      trip('t-other-series', { series_id: 's2' }),
    ]
    const itemsByTrip = (id: string) =>
      id === 't2024'
        ? [item({ trip_id: id, weight_grams: 1000, quantity: 2, packed_count: 1 })]
        : [item({ trip_id: id, weight_grams: 2000, packed_count: 1 })]

    const trend = seriesWeightTrend(trips, itemsByTrip, 's1')

    expect(trend.map((t) => t.tripName)).toEqual(['Engadin 2024', 'Engadin 2025'])
    expect(trend.map((t) => t.packedWeight)).toEqual([1000, 2000])
  })
})

describe('seriesTopFlagged (FR-14.3)', () => {
  it('counts missing/unused per item over the series’ archived trips, most frequent first', () => {
    const trips = [
      trip('a1'),
      trip('a2'),
      trip('active', { status: 'active' }),
      trip('other', { series_id: 's2' }),
    ]
    const itemsByTrip = (id: string) => {
      if (id === 'a1')
        return [
          item({ trip_id: id, name: 'Badetuch', flag_unused: true }),
          item({ trip_id: id, name: 'Reiseadapter', flag_missing: true }),
        ]
      if (id === 'a2') return [item({ trip_id: id, name: 'Badetuch', flag_unused: true })]
      // Flags on an active or foreign-series trip must not leak in.
      return [item({ trip_id: id, name: 'Fremd', flag_missing: true })]
    }

    const top = seriesTopFlagged(trips, itemsByTrip, 's1')

    expect(top).toEqual([
      { name: 'Badetuch', flag: 'unused', count: 2 },
      { name: 'Reiseadapter', flag: 'missing', count: 1 },
    ])
  })

  it('caps the list — a history-long tail is noise, not insight', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      item({ trip_id: 'a1', name: `Item ${i}`, flag_unused: true }),
    )
    const top = seriesTopFlagged([trip('a1')], () => many, 's1', 5)

    expect(top).toHaveLength(5)
  })
})
