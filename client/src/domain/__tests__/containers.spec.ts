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
  pairWrites,
  releasePartnersOnDelete,
  unassignedItems,
  unpairWrites,
} from '../containers'
import type { Container, TripItem } from '@/types/domain'

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
    packed_by_user_id: null,
    packed_at: null,
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

function container(id: string, paired: string | null = null): Container {
  return {
    id,
    trip_id: 't1',
    name: id,
    carrier_traveler_id: null,
    max_weight_grams: null,
    paired_container_id: paired,
  }
}

describe('pairWrites — pairing is exclusive and set on both sides at once (FR-10.3, M11)', () => {
  it('writes both sides of a fresh pair', () => {
    const cs = [container('a'), container('b')]

    expect(pairWrites(cs, 'a', 'b')).toEqual([
      { containerId: 'a', paired_container_id: 'b' },
      { containerId: 'b', paired_container_id: 'a' },
    ])
  })

  it('releases the old partner when one side re-pairs', () => {
    // a↔c exists; pairing a with b must free c, or c renders an
    // imbalance against a container that no longer considers itself paired.
    const cs = [container('a', 'c'), container('b'), container('c', 'a')]

    expect(pairWrites(cs, 'a', 'b')).toEqual([
      { containerId: 'c', paired_container_id: null },
      { containerId: 'a', paired_container_id: 'b' },
      { containerId: 'b', paired_container_id: 'a' },
    ])
  })

  it('releases both old partners when both sides were paired elsewhere', () => {
    const cs = [container('a', 'c'), container('b', 'd'), container('c', 'a'), container('d', 'b')]

    expect(pairWrites(cs, 'a', 'b')).toEqual([
      { containerId: 'c', paired_container_id: null },
      { containerId: 'd', paired_container_id: null },
      { containerId: 'a', paired_container_id: 'b' },
      { containerId: 'b', paired_container_id: 'a' },
    ])
  })

  it('refuses to pair a container with itself', () => {
    expect(pairWrites([container('a')], 'a', 'a')).toEqual([])
  })

  it('is idempotent on an existing pair', () => {
    const cs = [container('a', 'b'), container('b', 'a')]

    expect(pairWrites(cs, 'a', 'b')).toEqual([])
  })

  it('repairs a half-set pair instead of treating it as done', () => {
    // a→b but b→null (legacy one-sided write): the missing side is written.
    const cs = [container('a', 'b'), container('b')]

    expect(pairWrites(cs, 'a', 'b')).toEqual([{ containerId: 'b', paired_container_id: 'a' }])
  })
})

describe('unpairWrites — clearing one side releases the other (FR-10.3, M11)', () => {
  it('clears both sides of an intact pair', () => {
    const cs = [container('a', 'b'), container('b', 'a')]

    expect(unpairWrites(cs, 'a')).toEqual([
      { containerId: 'a', paired_container_id: null },
      { containerId: 'b', paired_container_id: null },
    ])
  })

  it('does nothing on an unpaired container', () => {
    expect(unpairWrites([container('a')], 'a')).toEqual([])
  })

  it('clears a dangling inbound pointer even when the container itself is clean', () => {
    // b→a is a half-set leftover; unpairing a must sweep it too.
    const cs = [container('a'), container('b', 'a')]

    expect(unpairWrites(cs, 'a')).toEqual([{ containerId: 'b', paired_container_id: null }])
  })
})

describe('releasePartnersOnDelete (FR-10.3, M11)', () => {
  it('frees every surviving container that pointed at the deleted one', () => {
    const cs = [container('a', 'b'), container('b', 'a'), container('c')]

    expect(releasePartnersOnDelete(cs, 'a')).toEqual([
      { containerId: 'b', paired_container_id: null },
    ])
  })

  it('never writes the deleted container itself', () => {
    const cs = [container('a', 'b'), container('b', 'a')]

    expect(releasePartnersOnDelete(cs, 'a').map((w) => w.containerId)).not.toContain('a')
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
