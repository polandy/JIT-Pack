import { describe, it, expect, vi } from 'vitest'
import {
  MASTER_PARTITION,
  pullPartition,
  pullPartitionAll,
  pushPartition,
  syncPath,
  tripPartition,
} from '../partition'
import type { APIClient } from '@/api/client'
import type { PullResponse, PushResponse } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'

function mockClient(responses: PullResponse[]): APIClient {
  const get = vi.fn()
  for (const r of responses) {
    get.mockResolvedValueOnce(r)
  }
  return { get, post: vi.fn() } as unknown as APIClient
}

function mockHLC(hlcValue = '0000000001000-0000-abcd1234'): HLCGenerator {
  return { observe: vi.fn(), next: vi.fn().mockReturnValue(hlcValue) } as unknown as HLCGenerator
}

describe('syncPath', () => {
  it('sends a trip partition to the trip feed and the master partition to its own', () => {
    expect(syncPath(tripPartition('trip-1'))).toBe('/api/v1/trips/trip-1/sync')
    expect(syncPath(MASTER_PARTITION)).toBe('/api/v1/master/sync')
  })

  /*
   * The id used to interpolate as the string "null" — a path the server
   * answers 404 and the outbox then retried for ever, naming nothing. Refusing
   * it here is the difference between a wedged queue and a stack trace.
   */
  it('refuses a trip partition without a trip id rather than asking for "null"', () => {
    expect(() => syncPath({ type: 'trip', id: null })).toThrow(/trip id/)
  })
})

describe('pullPartition', () => {
  it('pulls one page of a trip feed from the given cursor', async () => {
    const resp: PullResponse = {
      changes: [
        { seq: 1, table: 'trip_items', id: 'i1', deleted: false, row: { name: 'Socks' } },
        { seq: 2, table: 'trip_items', id: 'i2', deleted: false, row: { name: 'Shirt' } },
      ],
      next_cursor: 2,
      has_more: false,
    }
    const client = mockClient([resp])

    const page = await pullPartition(client, mockHLC(), tripPartition('trip-1'), 0)

    expect(client.get).toHaveBeenCalledWith('/api/v1/trips/trip-1/sync', {
      cursor: '0',
      limit: '500',
    })
    expect(page.changes).toHaveLength(2)
    expect(page.next_cursor).toBe(2)
  })

  it('pulls the master feed through the same call', async () => {
    const resp: PullResponse = {
      changes: [{ seq: 10, table: 'items', id: 'i1', deleted: false, row: { name: 'Tent' } }],
      next_cursor: 10,
      has_more: false,
    }
    const client = mockClient([resp])

    const page = await pullPartition(client, mockHLC(), MASTER_PARTITION, 0)

    expect(client.get).toHaveBeenCalledWith('/api/v1/master/sync', { cursor: '0', limit: '500' })
    expect(page.next_cursor).toBe(10)
  })

  it('observes the HLCs of the changes it pulled', async () => {
    const resp: PullResponse = {
      changes: [
        {
          seq: 1,
          table: 'trip_items',
          id: 'i1',
          deleted: false,
          row: { updated_hlc: '0000000005000-0001-deadbeef' },
        },
      ],
      next_cursor: 1,
      has_more: false,
    }
    const client = mockClient([resp])
    const hlc = mockHLC()

    await pullPartition(client, hlc, tripPartition('t1'), 0)

    expect(hlc.observe).toHaveBeenCalledWith('0000000005000-0001-deadbeef')
  })
})

describe('pullPartitionAll', () => {
  it('pages through has_more=true responses', async () => {
    const page1: PullResponse = {
      changes: [{ seq: 1, table: 'trip_items', id: 'i1', deleted: false, row: { name: 'A' } }],
      next_cursor: 1,
      has_more: true,
    }
    const page2: PullResponse = {
      changes: [{ seq: 2, table: 'trip_items', id: 'i2', deleted: false, row: { name: 'B' } }],
      next_cursor: 2,
      has_more: false,
    }
    const client = mockClient([page1, page2])

    const feed = await pullPartitionAll(client, mockHLC(), tripPartition('trip-1'), 0)

    expect(feed.changes).toHaveLength(2)
    expect(feed.nextCursor).toBe(2)
    expect(client.get).toHaveBeenCalledTimes(2)
  })

  it('asks each page from the cursor the one before it returned', async () => {
    const page1: PullResponse = { changes: [], next_cursor: 4, has_more: true }
    const page2: PullResponse = { changes: [], next_cursor: 9, has_more: false }
    const client = mockClient([page1, page2])

    await pullPartitionAll(client, mockHLC(), MASTER_PARTITION, 0)

    expect(vi.mocked(client.get).mock.calls.map((c) => c[1]?.['cursor'])).toEqual(['0', '4'])
  })

  /*
   * The command line is a client (invariant 4), so §4's paging rule is its
   * rule too — including the half that had been the app's alone until
   * 2026-09-01: a server that claims another page and does not move the
   * cursor. In a browser that spins a tab; here it is `jitpack import` never
   * returning, on a machine nobody is watching.
   *
   * The fake refuses a fourth call rather than answering for ever, so the
   * unfixed loop fails this case by name instead of exhausting the heap —
   * which is what it did when the case was first written against it.
   */
  function stuckServer(): APIClient {
    let calls = 0
    const stuck: PullResponse = { changes: [], next_cursor: 7, has_more: true }
    const get = vi.fn(async () => {
      if (++calls > 3) throw new Error('asked again from a cursor that had not moved')
      return stuck
    })
    return { get, post: vi.fn() } as unknown as APIClient
  }

  it('stops rather than spinning when the server does not advance the cursor', async () => {
    const client = stuckServer()

    await pullPartitionAll(client, mockHLC(), MASTER_PARTITION, 7)

    expect(client.get).toHaveBeenCalledTimes(1)
  })

  it('pages the trip partition too, and stops there for the same reason', async () => {
    const client = stuckServer()

    const feed = await pullPartitionAll(client, mockHLC(), tripPartition('trip-1'), 7)

    expect(client.get).toHaveBeenCalledTimes(1)
    expect(feed.nextCursor).toBe(7)
  })
})

describe('pushPartition', () => {
  function pushClient(resp: PushResponse): APIClient {
    return { get: vi.fn(), post: vi.fn().mockResolvedValue(resp) } as unknown as APIClient
  }

  const applied: PushResponse = {
    results: [{ mutation_id: 'uuid-1', outcome: 'applied' }],
    pull_hint: { next_cursor: 5 },
  }

  const mutation = {
    mutation_id: 'uuid-1',
    op: 'upsert' as const,
    table: 'trip_items',
    id: 'i1',
    fields: { packed_count: 3 },
    hlc: '0000000001000-0000-abcd1234',
  }

  it('stamps the envelope with this device’s clock and sends it to the trip feed', async () => {
    const client = pushClient(applied)

    await pushPartition(client, mockHLC(), tripPartition('trip-1'), [mutation])

    expect(client.post).toHaveBeenCalledWith('/api/v1/trips/trip-1/sync', {
      client_hlc: '0000000001000-0000-abcd1234',
      mutations: [expect.objectContaining({ mutation_id: 'uuid-1' })],
    })
  })

  it('pushes the master feed through the same call', async () => {
    const client = pushClient(applied)

    await pushPartition(client, mockHLC(), MASTER_PARTITION, [mutation])

    expect(client.post).toHaveBeenCalledWith('/api/v1/master/sync', expect.any(Object))
  })

  /*
   * Handed back whole, and that is the contract the drain relies on: it reads
   * `results` for what to park and `pull_hint` for nothing at all, and a shape
   * of our own in between would be one more place for the two to disagree.
   */
  it('returns the response as the server sent it, conflicts included', async () => {
    const merged: PushResponse = {
      results: [
        {
          mutation_id: 'uuid-3',
          outcome: 'merged',
          conflicts: [{ field: 'quantity', losing_value: 5, winning_value: 3 }],
        },
      ],
      pull_hint: { next_cursor: 7 },
    }
    const client = pushClient(merged)

    const resp = await pushPartition(client, mockHLC(), tripPartition('t1'), [mutation])

    expect(resp).toBe(merged)
  })
})
