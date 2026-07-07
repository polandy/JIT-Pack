import { describe, it, expect, vi } from 'vitest'
import { usePush } from '../usePush'
import type { APIClient } from '@/api/client'
import type { PushResponse } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'

function mockClient(resp: PushResponse): APIClient {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(resp),
  } as unknown as APIClient
}

function mockHLC(hlcValue = '0000000001000-0000-abcd1234'): HLCGenerator {
  return {
    next: vi.fn().mockReturnValue(hlcValue),
    observe: vi.fn(),
  } as unknown as HLCGenerator
}

describe('usePush', () => {
  it('pushes mutations to a trip', async () => {
    const resp: PushResponse = {
      results: [{ mutation_id: 'uuid-1', status: 'applied' }],
      pull_hint: { next_cursor: 5 },
    }
    const client = mockClient(resp)
    const hlc = mockHLC()
    const push = usePush(client, hlc)

    const result = await push.pushTrip('trip-1', [
      {
        mutation_id: 'uuid-1',
        op: 'upsert',
        table: 'trip_items',
        id: 'i1',
        fields: { packed_count: 3 },
        hlc: '0000000001000-0000-abcd1234',
      },
    ])

    expect(client.post).toHaveBeenCalledWith('/api/v1/sync/trips/trip-1', {
      client_hlc: '0000000001000-0000-abcd1234',
      mutations: [expect.objectContaining({ mutation_id: 'uuid-1' })],
    })
    expect(result.results).toHaveLength(1)
    expect(result.pullHintCursor).toBe(5)
  })

  it('pushes to master partition', async () => {
    const resp: PushResponse = {
      results: [{ mutation_id: 'uuid-2', status: 'applied' }],
      pull_hint: { next_cursor: 10 },
    }
    const client = mockClient(resp)
    const hlc = mockHLC()
    const push = usePush(client, hlc)

    const result = await push.pushMaster([
      {
        mutation_id: 'uuid-2',
        op: 'insert',
        table: 'items',
        id: 'i99',
        fields: { name: 'Tent' },
        hlc: '0000000001000-0000-abcd1234',
      },
    ])

    expect(client.post).toHaveBeenCalledWith('/api/v1/sync/master', expect.any(Object))
    expect(result.pullHintCursor).toBe(10)
  })

  it('returns merged status with conflicts', async () => {
    const resp: PushResponse = {
      results: [
        {
          mutation_id: 'uuid-3',
          status: 'merged',
          conflicts: [{ field: 'quantity', losing_value: 5, winning_value: 3 }],
        },
      ],
      pull_hint: { next_cursor: 7 },
    }
    const client = mockClient(resp)
    const hlc = mockHLC()
    const push = usePush(client, hlc)

    const result = await push.pushTrip('t1', [
      {
        mutation_id: 'uuid-3',
        op: 'upsert',
        table: 'trip_items',
        id: 'i1',
        fields: { quantity: 5 },
        hlc: '0000000001000-0000-abcd1234',
      },
    ])

    expect(result.results[0]!.status).toBe('merged')
    expect(result.results[0]!.conflicts).toHaveLength(1)
  })
})
