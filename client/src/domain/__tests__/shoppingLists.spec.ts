/**
 * M6 shopping views (FR-3.1/3.2/3.3): procurement lists derived from
 * item mode, purchased BUY_BEFORE items shift to PACK and leave the
 * list, and what was bought from each (FR-25.11j).
 */
import { describe, it, expect } from 'vitest'

import { shoppingLists } from '../shoppingLists'
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
    bought_at: null,
    bought_by_user_id: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '',
    ...overrides,
  }
}

describe('shoppingLists', () => {
  it('splits open items by procurement mode and drops packed ones', () => {
    const { buyBefore, buyLocal } = shoppingLists([
      item('pack-item'),
      item('before', { mode: 'buy_before' }),
      item('before-packed', { mode: 'buy_before', state: 'packed', packed_count: 1 }),
      item('local', { mode: 'buy_local' }),
    ])

    expect(buyBefore.map((i) => i.id)).toEqual(['before'])
    expect(buyLocal.map((i) => i.id)).toEqual(['local'])
  })

  it('purchased BUY_BEFORE items leave the list once mode flips to pack (FR-3.3)', () => {
    const { buyBefore } = shoppingLists([item('before', { mode: 'pack' })])
    expect(buyBefore).toHaveLength(0)
  })
})

/**
 * FR-25.11j: buying a row takes it off the shopping side — off the list by a
 * mode change (BUY_BEFORE) or by being packed (BUY_LOCAL). `bought_from` is
 * what lets M6 find it again, and the two lists stay disjoint: a row that is
 * still actionable on its tab is never also counted as done.
 */
describe('shoppingLists — what was bought (FR-25.11j)', () => {
  it('finds a purchased BUY_BEFORE row by the list it was bought from', () => {
    const { buyBefore, boughtBefore } = shoppingLists([
      item('before', { mode: 'pack', bought_from: 'buy_before' }),
    ])

    expect(buyBefore).toHaveLength(0)
    expect(boughtBefore.map((i) => i.id)).toEqual(['before'])
  })

  it('finds a purchased BUY_LOCAL row, which stayed in its own mode', () => {
    const { buyLocal, boughtLocal } = shoppingLists([
      item('local', {
        mode: 'buy_local',
        state: 'packed',
        packed_count: 1,
        bought_from: 'buy_local',
      }),
    ])

    expect(buyLocal).toHaveLength(0)
    expect(boughtLocal.map((i) => i.id)).toEqual(['local'])
  })

  it('finds a BUY_LOCAL row packed on the packing list, which wrote no bought_from (FR-25.17)', () => {
    // A BUY_LOCAL purchase *is* a packing act, so checking the row off on M4
    // records it the ordinary FR-25.17 way and never touches `bought_from`.
    // Reading only that column loses the row off both tabs at once.
    const { buyLocal, boughtLocal } = shoppingLists([
      item('local', { mode: 'buy_local', state: 'packed', packed_count: 1 }),
    ])

    expect(buyLocal).toHaveLength(0)
    expect(boughtLocal.map((i) => i.id)).toEqual(['local'])
  })

  it('still finds a BUY_LOCAL row by bought_from once its mode moved on', () => {
    // Bought on M6, then put on the packing list by hand (M5): the derived
    // rule above no longer sees it, and `bought_from` is the only way back.
    const { boughtLocal } = shoppingLists([
      item('local', {
        mode: 'pack',
        state: 'packed',
        packed_count: 1,
        bought_from: 'buy_local',
      }),
    ])

    expect(boughtLocal.map((i) => i.id)).toEqual(['local'])
  })

  it('a skipped BUY_LOCAL row is not a bought one (FR-5.5)', () => {
    // Skipping says the trip does not need it, which is not a purchase. The
    // open tab drops it too, so this asserts the boundary of the rule above
    // rather than an absence on its own.
    const { buyLocal, boughtLocal } = shoppingLists([
      item('needed', { mode: 'buy_local' }),
      item('skipped', { mode: 'buy_local', state: 'skipped', quantity: 0 }),
    ])

    expect(buyLocal.map((i) => i.id)).toEqual(['needed'])
    expect(boughtLocal).toEqual([])
  })

  it('never counts a row as both open and bought', () => {
    // The mode was put back by hand (M5) rather than by FR-25.11j's undo, so
    // the record outlives the purchase. The row is actionable again, and an
    // actionable row hidden under "bought" is the failure FR-25.11a names.
    const { buyBefore, boughtBefore } = shoppingLists([
      item('before', { mode: 'buy_before', bought_from: 'buy_before' }),
    ])

    expect(buyBefore.map((i) => i.id)).toEqual(['before'])
    expect(boughtBefore).toHaveLength(0)
  })

  it('nothing bought is an empty pair, not a missing one', () => {
    const { boughtBefore, boughtLocal } = shoppingLists([item('before', { mode: 'buy_before' })])

    expect(boughtBefore).toEqual([])
    expect(boughtLocal).toEqual([])
  })
})
