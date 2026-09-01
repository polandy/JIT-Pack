import { describe, it, expect, vi } from 'vitest'
import { usePull } from '../usePull'
import type { APIClient } from '@/api/client'
import type { PullResponse } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'

function mockClient(responses: PullResponse[]): APIClient {
  const get = vi.fn()
  for (const r of responses) {
    get.mockResolvedValueOnce(r)
  }
  return { get, post: vi.fn() } as unknown as APIClient
}

function mockHLC(): HLCGenerator {
  return { observe: vi.fn(), next: vi.fn() } as unknown as HLCGenerator
}

describe('usePull', () => {
  it('pulls trip changes from cursor 0', async () => {
    const resp: PullResponse = {
      changes: [
        {
          seq: 1,
          table: 'trip_items',
          id: 'i1',
          deleted: false,
          row: { name: 'Socks', quantity: 3 },
        },
        {
          seq: 2,
          table: 'trip_items',
          id: 'i2',
          deleted: false,
          row: { name: 'Shirt', quantity: 1 },
        },
      ],
      next_cursor: 2,
      has_more: false,
    }
    const client = mockClient([resp])
    const hlc = mockHLC()
    const pull = usePull(client, hlc)

    const result = await pull.pullTrip('trip-1', 0)

    expect(client.get).toHaveBeenCalledWith('/api/v1/trips/trip-1/sync', {
      cursor: '0',
      limit: '500',
    })
    expect(result.changes).toHaveLength(2)
    expect(result.nextCursor).toBe(2)
    expect(result.hasMore).toBe(false)
  })

  it('pulls master changes', async () => {
    const resp: PullResponse = {
      changes: [{ seq: 10, table: 'items', id: 'i1', deleted: false, row: { name: 'Tent' } }],
      next_cursor: 10,
      has_more: false,
    }
    const client = mockClient([resp])
    const hlc = mockHLC()
    const pull = usePull(client, hlc)

    const result = await pull.pullMaster(0)

    expect(client.get).toHaveBeenCalledWith('/api/v1/master/sync', {
      cursor: '0',
      limit: '500',
    })
    expect(result.changes).toHaveLength(1)
    expect(result.nextCursor).toBe(10)
  })

  it('observes HLCs from pulled changes', async () => {
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
    const pull = usePull(client, hlc)

    await pull.pullTrip('t1', 0)

    expect(hlc.observe).toHaveBeenCalledWith('0000000005000-0001-deadbeef')
  })

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
    const hlc = mockHLC()
    const pull = usePull(client, hlc)

    const result = await pull.pullTripAll('trip-1', 0)

    expect(result.changes).toHaveLength(2)
    expect(result.nextCursor).toBe(2)
    expect(client.get).toHaveBeenCalledTimes(2)
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
    const pull = usePull(client, mockHLC())

    await pull.pullMasterAll(7)

    expect(client.get).toHaveBeenCalledTimes(1)
  })

  it('pages the trip partition too, and stops there for the same reason', async () => {
    const client = stuckServer()
    const pull = usePull(client, mockHLC())

    const result = await pull.pullTripAll('trip-1', 7)

    expect(client.get).toHaveBeenCalledTimes(1)
    expect(result.nextCursor).toBe(7)
  })
})
