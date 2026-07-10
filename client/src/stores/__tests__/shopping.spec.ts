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
