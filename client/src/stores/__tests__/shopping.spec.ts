/**
 * M6 shopping views (FR-3.1/3.2/3.3): procurement lists derived from
 * item mode, purchased BUY_BEFORE items shift to PACK and leave the
 * list, quick-add lands in the chosen list.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useMutations } from '@/composables/useMutations'
import { HLCGenerator } from '@/sync/hlc'
import { useTripStore } from '@/stores/tripStore'
import type { PullChange } from '@/api/types'

function itemChange(id: string, row: Record<string, unknown> = {}): PullChange {
  return {
    seq: 0,
    table: 'trip_items',
    id,
    deleted: false,
    row: {
      trip_id: 't1',
      name: id,
      quantity: 1,
      packed_count: 0,
      state: 'open',
      mode: 'pack',
      ...row,
    },
  }
}

describe('tripStore.getShoppingItems', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('splits open items by procurement mode and drops packed ones', () => {
    const store = useTripStore()
    store.applyChange(itemChange('pack-item'))
    store.applyChange(itemChange('before', { mode: 'buy_before' }))
    store.applyChange(
      itemChange('before-packed', { mode: 'buy_before', state: 'packed', packed_count: 1 }),
    )
    store.applyChange(itemChange('local', { mode: 'buy_local' }))

    const { buyBefore, buyLocal } = store.getShoppingItems('t1')

    expect(buyBefore.map((i) => i.id)).toEqual(['before'])
    expect(buyLocal.map((i) => i.id)).toEqual(['local'])
  })

  it('purchased BUY_BEFORE items leave the list once mode flips to pack (FR-3.3)', () => {
    const store = useTripStore()
    store.applyChange(itemChange('before', { mode: 'buy_before' }))

    store.applyChange(itemChange('before', { mode: 'pack' }))

    const { buyBefore } = store.getShoppingItems('t1')
    expect(buyBefore).toHaveLength(0)
  })
})

/**
 * FR-25.11j: buying a row takes it off the shopping side — off the list by a
 * mode change (BUY_BEFORE) or by being packed (BUY_LOCAL). `bought_from` is
 * what lets M6 find it again, and the two lists stay disjoint: a row that is
 * still actionable on its tab is never also counted as done.
 */
describe('tripStore.getShoppingItems — what was bought (FR-25.11j)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('finds a purchased BUY_BEFORE row by the list it was bought from', () => {
    const store = useTripStore()
    store.applyChange(itemChange('before', { mode: 'pack', bought_from: 'buy_before' }))

    const { buyBefore, boughtBefore } = store.getShoppingItems('t1')

    expect(buyBefore).toHaveLength(0)
    expect(boughtBefore.map((i) => i.id)).toEqual(['before'])
  })

  it('finds a purchased BUY_LOCAL row, which stayed in its own mode', () => {
    const store = useTripStore()
    store.applyChange(
      itemChange('local', {
        mode: 'buy_local',
        state: 'packed',
        packed_count: 1,
        bought_from: 'buy_local',
      }),
    )

    const { buyLocal, boughtLocal } = store.getShoppingItems('t1')

    expect(buyLocal).toHaveLength(0)
    expect(boughtLocal.map((i) => i.id)).toEqual(['local'])
  })

  it('never counts a row as both open and bought', () => {
    // The mode was put back by hand (M5) rather than by FR-25.11j's undo, so
    // the record outlives the purchase. The row is actionable again, and an
    // actionable row hidden under "bought" is the failure FR-25.11a names.
    const store = useTripStore()
    store.applyChange(itemChange('before', { mode: 'buy_before', bought_from: 'buy_before' }))

    const { buyBefore, boughtBefore } = store.getShoppingItems('t1')

    expect(buyBefore.map((i) => i.id)).toEqual(['before'])
    expect(boughtBefore).toHaveLength(0)
  })

  it('nothing bought is an empty pair, not a missing one', () => {
    const store = useTripStore()
    store.applyChange(itemChange('before', { mode: 'buy_before' }))

    const { boughtBefore, boughtLocal } = store.getShoppingItems('t1')

    expect(boughtBefore).toEqual([])
    expect(boughtLocal).toEqual([])
  })

  it('carries bought_from onto the row it reads (FR-25.11j)', () => {
    const store = useTripStore()
    store.applyChange(itemChange('before', { mode: 'pack', bought_from: 'buy_before' }))
    store.applyChange(itemChange('never', {}))

    const items = store.getItems('t1')
    expect(items.find((i) => i.id === 'before')?.bought_from).toBe('buy_before')
    expect(items.find((i) => i.id === 'never')?.bought_from).toBeNull()
  })
})

describe('addTripItem with procurement mode', () => {
  const mutations = useMutations(new HLCGenerator(() => Date.now(), 'aabbccdd'))

  it('lands quick-adds in the chosen shopping list', () => {
    const { mutation } = mutations.addTripItem('t1', 'Sonnencreme', { mode: 'buy_local' })

    expect(mutation.fields).toMatchObject({ mode: 'buy_local', state: 'open' })
  })

  it('defaults to pack for the M4 quick-add', () => {
    const { mutation } = mutations.addTripItem('t1', 'Socken', {})

    expect(mutation.fields).toMatchObject({ mode: 'pack' })
  })
})
