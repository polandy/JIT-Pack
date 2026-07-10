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

    expect(client.get).toHaveBeenCalledWith('/api/v1/sync/trips/trip-1', {
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

    expect(client.get).toHaveBeenCalledWith('/api/v1/sync/master', {
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
})
