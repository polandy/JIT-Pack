/**
 * The write funnel (ARCH-12): a caller hands over a mutation, and the funnel
 * decides the feed and the paint. Driven here over a map standing in for the
 * stores, so each rule is read off one write and one recorded queue.
 */
import { describe, it, expect } from 'vitest'

import type { Mutation, PullChange } from '@/api/types'
import { TABLE } from '@/types/tables'
import { optimisticDelete } from '../optimistic'
import { MASTER_PARTITION, tripPartition } from '../partition'
import type { SyncRow } from '../tableRegistry'
import { createWriteFunnel, mutationOf, paintOf, type PartitionBatch } from '../writeFunnel'

const TRIP_ID = 'trip-1'

function mutation(
  op: Mutation['op'],
  table: string,
  id: string,
  fields?: Record<string, unknown>,
): Mutation {
  return { mutation_id: `m-${id}`, op, table, id, fields, hlc: '1-0-dev' }
}

/** A funnel over a row map that paints the way a store would: replace or remove. */
function harness(seed: Record<string, SyncRow> = {}) {
  const rows = new Map(Object.entries(seed))
  const painted: PullChange[] = []
  const queued: PartitionBatch[] = []
  const funnel = createWriteFunnel({
    currentRow: (table, id) => rows.get(`${table}/${id}`),
    paint: (changes) => {
      for (const c of changes) {
        painted.push(c)
        if (c.deleted) rows.delete(`${c.table}/${c.id}`)
        else rows.set(`${c.table}/${c.id}`, c.row as SyncRow)
      }
    },
    queue: (batch) => queued.push(batch),
  })
  return { funnel, rows, painted, queued }
}

const ITEM = { id: 'item-1', trip_id: TRIP_ID, name: 'Zelt', quantity: 2, packed_count: 0 }

describe('the write funnel — the paint', () => {
  it('lays an upsert over the row the store holds now, not over a snapshot taken earlier', () => {
    const { funnel, rows, painted } = harness({ [`${TABLE.tripItems}/item-1`]: ITEM })
    // Lands between the caller reading the row and the write — a pull, a packer avatar.
    rows.set(`${TABLE.tripItems}/item-1`, { ...ITEM, packing_now_by: 'u-2' })

    funnel.queueWrites(mutation('upsert', TABLE.tripItems, 'item-1', { packed_count: 1 }))

    expect(painted[0]!.row).toEqual({ ...ITEM, packing_now_by: 'u-2', packed_count: 1 })
  })

  it('paints an insert as its fields and a delete as a tombstone', () => {
    const { funnel, painted } = harness({ [`${TABLE.tripItems}/item-1`]: ITEM })

    funnel.queueWrites(
      mutation('insert', TABLE.tripItems, 'item-2', { trip_id: TRIP_ID, name: 'Kocher' }),
      mutation('delete', TABLE.tripItems, 'item-1'),
    )

    expect(painted.map((c) => [c.id, c.deleted, c.row])).toEqual([
      ['item-2', false, { trip_id: TRIP_ID, name: 'Kocher' }],
      ['item-1', true, null],
    ])
  })

  it('reads back a row an earlier write of the same call inserted', () => {
    const { funnel, painted } = harness()

    funnel.queueWrites(
      mutation('insert', TABLE.tripItems, 'item-2', { trip_id: TRIP_ID, name: 'Kocher' }),
      mutation('upsert', TABLE.tripItems, 'item-2', { quantity: 3 }),
    )

    expect(painted[1]!.row).toEqual({ trip_id: TRIP_ID, name: 'Kocher', quantity: 3 })
  })

  it('takes a paint the caller spelled out as given — a cascade paints its children', () => {
    const { funnel, painted } = harness({ [`${TABLE.tripItems}/item-1`]: ITEM })
    const removal = mutation('delete', TABLE.tripItems, 'item-1')
    const child: PullChange = {
      seq: 0,
      table: TABLE.comments,
      id: 'c-1',
      deleted: true,
      row: null,
    }

    funnel.queueWrites({ mutation: removal, optimistic: [child, optimisticDelete(removal)] })

    expect(painted.map((c) => c.id)).toEqual(['c-1', 'item-1'])
  })

  it('paints nothing for an upsert of a row the device does not hold', () => {
    expect(paintOf(mutation('upsert', TABLE.tripItems, 'gone', { quantity: 1 }), undefined)).toBe(
      undefined,
    )
  })
})

describe('the write funnel — a row that is gone', () => {
  // Deleted between the read and the write, here or on another device:
  // re-upserting it would resurrect a row somebody removed on purpose.
  it('drops an upsert of a row the device no longer holds — no paint, no queue', () => {
    const { funnel, painted, queued } = harness()

    const batches = funnel.queueWrites(mutation('upsert', TABLE.tripItems, 'gone', { quantity: 1 }))

    expect(batches).toEqual([])
    expect(painted).toEqual([])
    expect(queued).toEqual([])
  })

  it('drops a delete of a row the device no longer holds', () => {
    const { funnel, queued } = harness()

    funnel.queueWrites(mutation('delete', TABLE.tags, 'gone'))

    expect(queued).toEqual([])
  })

  it('still writes the rest of the call', () => {
    const { funnel, queued } = harness({ [`${TABLE.tripItems}/item-1`]: ITEM })

    funnel.queueWrites(
      mutation('upsert', TABLE.tripItems, 'gone', { quantity: 1 }),
      mutation('upsert', TABLE.tripItems, 'item-1', { quantity: 1 }),
    )

    expect(queued.flatMap((b) => b.muts.map((m) => m.mutation.id))).toEqual(['item-1'])
  })

  it('refuses a spelled-out trip write it cannot place, rather than queue it nowhere', () => {
    const { funnel } = harness()
    const orphan = mutation('upsert', TABLE.tripItems, 'gone', { quantity: 1 })

    expect(() => funnel.queueWrites({ mutation: orphan })).toThrow(/no trip/)
  })
})

describe('the write funnel — the feed (Sync-API P-3)', () => {
  it('queues master data on the master feed', () => {
    const { funnel, queued } = harness()

    funnel.queueWrites(mutation('insert', TABLE.tags, 'tag-1', { name: 'Berg' }))

    expect(queued.map((b) => b.partition)).toEqual([MASTER_PARTITION])
  })

  it("queues a trip-feed row on its trip's feed, read off the row the store holds", () => {
    const { funnel, queued } = harness({ [`${TABLE.tripItems}/item-1`]: ITEM })

    funnel.queueWrites(mutation('upsert', TABLE.tripItems, 'item-1', { quantity: 3 }))

    expect(queued.map((b) => b.partition)).toEqual([tripPartition(TRIP_ID)])
  })

  it("places a delete by the row's trip, read before the tombstone removes it", () => {
    const { funnel, queued } = harness({ [`${TABLE.tripItems}/item-1`]: ITEM })

    funnel.queueWrites(mutation('delete', TABLE.tripItems, 'item-1'))

    expect(queued.map((b) => b.partition)).toEqual([tripPartition(TRIP_ID)])
  })

  it('queues the per-trip tables the master feed carries on the master feed', () => {
    const { funnel, queued } = harness()

    funnel.queueWrites(
      mutation('insert', TABLE.tripMembers, 'mem-1', { trip_id: TRIP_ID, user_id: 'u-1' }),
    )

    expect(queued.map((b) => b.partition)).toEqual([MASTER_PARTITION])
  })

  it('keeps one call one batch per feed, master first, in the order the rows were written', () => {
    const { funnel, queued } = harness()

    funnel.queueWrites(
      mutation('insert', TABLE.tripItems, 'a', { trip_id: TRIP_ID }),
      mutation('insert', TABLE.trips, TRIP_ID, { name: 'Sommer' }),
      mutation('insert', TABLE.travelers, 'b', { trip_id: TRIP_ID }),
      mutation('insert', TABLE.tripItems, 'c', { trip_id: 'trip-2' }),
    )

    expect(queued.map((b) => [b.partition, b.muts.map((m) => mutationOf(m).id)])).toEqual([
      [MASTER_PARTITION, [TRIP_ID]],
      [tripPartition(TRIP_ID), ['a', 'b']],
      [tripPartition('trip-2'), ['c']],
    ])
  })
})
