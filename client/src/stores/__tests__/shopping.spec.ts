/**
 * M6 shopping views (FR-3.1/3.2/3.3): procurement lists derived from
 * item mode, purchased BUY_BEFORE items shift to PACK and leave the
 * list, quick-add lands in the chosen list.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { createMutations } from '@/sync/mutations'
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

// The derivation itself — splitting open items by procurement mode, and
// finding what was bought from each (FR-25.11j) — is `domain/shoppingLists`'s
// own spec; this file is left with what is the store's: that it hands the
// rule its own rows untouched.
describe('tripStore.getShoppingItems', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('carries bought_from onto the row it reads (FR-25.11j)', () => {
    const tripStore = useTripStore()
    tripStore.applyChange(itemChange('before', { mode: 'pack', bought_from: 'buy_before' }))
    tripStore.applyChange(itemChange('never', {}))

    const items = tripStore.getItems('t1')
    expect(items.find((i) => i.id === 'before')?.bought_from).toBe('buy_before')
    expect(items.find((i) => i.id === 'never')?.bought_from).toBeNull()
  })
})

describe('addTripItem with procurement mode', () => {
  const mutations = createMutations(new HLCGenerator(() => Date.now(), 'aabbccdd'))

  it('lands quick-adds in the chosen shopping list', () => {
    const { mutation } = mutations.addTripItem('t1', 'Sonnencreme', { mode: 'buy_local' })

    expect(mutation.fields).toMatchObject({ mode: 'buy_local', state: 'open' })
  })

  it('defaults to pack for the M4 quick-add', () => {
    const { mutation } = mutations.addTripItem('t1', 'Socken', {})

    expect(mutation.fields).toMatchObject({ mode: 'pack' })
  })
})
