/**
 * Repack planning (FR-11.1/11.2) — pure: which items reset to Open for
 * the return leg, which are excluded (consumables, locally bought) with
 * a per-item override, which are untouched.
 */
import { describe, expect, it } from 'vitest'

import { planRepack } from '../repack'
import type { TripItem } from '@/types/domain'

function item(id: string, overrides: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: 't1',
    source_item_id: null,
    source_template_id: null,
    name: id,
    weight_grams: null,
    value_cents: null,
    category_name: null,
    quantity: 2,
    packed_count: 2,
    state: 'packed',
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

describe('planRepack', () => {
  const isConsumable = (sourceItemId: string | null) => sourceItemId === 'master-consumable'

  it('resets packed PACK items, excludes consumables and locally bought (FR-11.2)', () => {
    const items = [
      item('zelt'),
      item('sonnencreme', { source_item_id: 'master-consumable' }),
      item('strandtuch', { mode: 'buy_local' }),
      item('offen', { state: 'open', packed_count: 0 }),
      item('geskippt', { state: 'skipped', packed_count: 0, quantity: 0 }),
    ]

    const plan = planRepack(items, isConsumable)

    expect(plan.reset.map((i) => i.id)).toEqual(['zelt'])
    expect(plan.excluded).toEqual([
      { item: items[1], reason: 'consumable' },
      { item: items[2], reason: 'buy_local' },
    ])
    expect(plan.untouched.map((i) => i.id)).toEqual(['offen', 'geskippt'])
  })

  it('includes partially packed items in the reset', () => {
    const plan = planRepack([item('teils', { state: 'partial', packed_count: 1 })], isConsumable)

    expect(plan.reset).toHaveLength(1)
  })
})
