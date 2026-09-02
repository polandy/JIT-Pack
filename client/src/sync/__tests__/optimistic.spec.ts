import { describe, it, expect } from 'vitest'

import type { Mutation } from '@/api/types'
import {
  changesOf,
  localChange,
  localTombstone,
  optimisticDelete,
  optimisticInsert,
  optimisticUpdate,
} from '../optimistic'

function mutation(fields?: Record<string, unknown>, op: Mutation['op'] = 'upsert'): Mutation {
  return { mutation_id: 'm-1', op, table: 'trip_items', id: 'row-1', fields, hlc: '1-0-dev' }
}

describe('optimisticInsert', () => {
  it('takes the table and the id from the mutation, so the two cannot disagree', () => {
    const change = optimisticInsert(mutation({ name: 'Zelt' }))
    expect(change).toEqual({
      seq: 0,
      table: 'trip_items',
      id: 'row-1',
      deleted: false,
      row: { name: 'Zelt' },
    })
  })

  it('carries an empty row rather than null when a mutation has no fields', () => {
    expect(optimisticInsert(mutation(undefined)).row).toEqual({})
  })
})

describe('optimisticUpdate', () => {
  // The rule the 80 hand-written call sites carried by convention: the
  // stores apply a change by *replacing* the row, so a column the mutation
  // does not mention has to come from the row that is already there. In
  // Local Mode no pull ever arrives to heal it.
  it('keeps every column the mutation does not mention', () => {
    const current = { name: 'Zelt', quantity: 2, packed_count: 0, late_packer: false }
    const change = optimisticUpdate(mutation({ packed_count: 2, state: 'packed' }), current)

    expect(change.row).toEqual({
      name: 'Zelt',
      quantity: 2,
      packed_count: 2,
      state: 'packed',
      late_packer: false,
    })
  })

  it('lets the mutation win over the row it is applied to', () => {
    const change = optimisticUpdate(mutation({ quantity: 5 }), { quantity: 2 })
    expect(change.row).toEqual({ quantity: 5 })
  })

  it('does not write into the row it was given', () => {
    const current = { quantity: 2 }
    optimisticUpdate(mutation({ quantity: 5 }), current)
    expect(current).toEqual({ quantity: 2 })
  })

  it('is an upsert, not a tombstone', () => {
    const change = optimisticUpdate(mutation({ quantity: 5 }), {})
    expect(change.deleted).toBe(false)
    expect(change.seq).toBe(0)
  })
})

describe('optimisticDelete', () => {
  it('is a tombstone addressed by the mutation it belongs to', () => {
    const change = optimisticDelete(mutation(undefined, 'delete'))
    expect(change).toEqual({
      seq: 0,
      table: 'trip_items',
      id: 'row-1',
      deleted: true,
      row: null,
    })
  })
})

// The two below serve the paths that have no mutation at all: an item image
// is stored outside the sync envelope (ADR-002), so in Local Mode the hash
// reaches the store as a change nothing was pushed for.
describe('localChange / localTombstone', () => {
  it('addresses a row the caller names, and carries it whole', () => {
    expect(localChange('items', 'item-1', { image_hash: 'abc' })).toEqual({
      seq: 0,
      table: 'items',
      id: 'item-1',
      deleted: false,
      row: { image_hash: 'abc' },
    })
  })

  it('treats a missing row as an empty one', () => {
    expect(localChange('items', 'item-1', undefined).row).toEqual({})
  })

  it('tombstones without a row', () => {
    expect(localTombstone('items', 'item-1')).toEqual({
      seq: 0,
      table: 'items',
      id: 'item-1',
      deleted: true,
      row: null,
    })
  })

  // A delete that cascades paints several rows for one mutation, so every
  // consumer of `QueuedMutation.optimistic` unfolds it through here rather
  // than each deciding what a missing or plural value means.
  describe('changesOf', () => {
    it('is empty for a write that paints nothing', () => {
      expect(changesOf(undefined)).toEqual([])
    })

    it('wraps the single change of an ordinary write', () => {
      const one = localTombstone('items', 'item-1')
      expect(changesOf(one)).toEqual([one])
    })

    it('passes a cascade through in order', () => {
      const many = [localTombstone('item_tags', 'a1'), localTombstone('items', 'item-1')]
      expect(changesOf(many)).toEqual(many)
    })
  })
})
