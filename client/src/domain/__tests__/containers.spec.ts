/**
 * Container weight budgets (FR-10.3) — pure derivations for M11:
 * cumulative planned weight per container, budget level, and the
 * pairing imbalance rule (default 15 %, per-trip override).
 */
import { describe, expect, it } from 'vitest'

import {
  budgetLevel,
  containerWeight,
  imbalancePercent,
  imbalanceThreshold,
  unassignedItems,
} from '../containers'
import type { TripItem } from '@/types/domain'

function item(overrides: Partial<TripItem>): TripItem {
  return {
    id: 'i1',
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

describe('containerWeight', () => {
  it('sums weight × quantity of assigned items', () => {
    const items = [
      item({ id: 'a', container_id: 'c1', weight_grams: 200, quantity: 3 }),
      item({ id: 'b', container_id: 'c1', weight_grams: 50, quantity: 1 }),
      item({ id: 'c', container_id: 'other', weight_grams: 999 }),
      item({ id: 'd', container_id: 'c1', weight_grams: null }),
    ]

    expect(containerWeight(items, 'c1')).toBe(650)
  })

  it('excludes consciously skipped items', () => {
    const items = [
      item({ id: 'a', container_id: 'c1', weight_grams: 200, quantity: 0, state: 'skipped' }),
    ]

    expect(containerWeight(items, 'c1')).toBe(0)
  })
})

describe('unassignedItems', () => {
  it('keeps the FR-10.2 bucket visible: no container, not skipped', () => {
    const items = [
      item({ id: 'a', container_id: null }),
      item({ id: 'b', container_id: 'c1' }),
      item({ id: 'c', container_id: null, state: 'skipped' }),
    ]

    expect(unassignedItems(items).map((i) => i.id)).toEqual(['a'])
  })
})

describe('budgetLevel (FR-10.3)', () => {
  it.each([
    [500, 1000, 'ok'],
    [901, 1000, 'warn'], // amber at 90 %
    [1001, 1000, 'over'], // red beyond max
    [500, null, 'ok'], // no budget, no warning
  ])('%d g of %s g max → %s', (weight, max, want) => {
    expect(budgetLevel(weight, max)).toBe(want)
  })
})

describe('pairing imbalance (FR-10.3)', () => {
  it('measures the difference relative to the heavier side', () => {
    expect(imbalancePercent(1000, 800)).toBe(20)
    expect(imbalancePercent(800, 1000)).toBe(20)
    expect(imbalancePercent(0, 0)).toBe(0)
    expect(imbalancePercent(1000, 0)).toBe(100)
  })

  it('defaults to 15 % and honors the per-trip override', () => {
    expect(imbalanceThreshold(null)).toBe(15)
    expect(imbalanceThreshold({ imbalance_threshold: 25 })).toBe(25)
    expect(imbalanceThreshold({ imbalance_threshold: 'nonsense' })).toBe(15)
  })
})
