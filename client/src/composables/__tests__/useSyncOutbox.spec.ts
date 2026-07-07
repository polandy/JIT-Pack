import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncOutbox } from '../useSyncOutbox'
import type { Mutation, PushResponse, MutationResult, PullResponse, PullChange } from '@/api/types'
import type { APIClient } from '@/api/client'
import type { HLCGenerator } from '@/sync/hlc'

function mockHLC(): HLCGenerator {
  let counter = 0
  return {
    next: vi.fn(() => `0000000001000-${String(counter++).padStart(4, '0')}-abcd1234`),
    observe: vi.fn(),
  } as unknown as HLCGenerator
}

function makeMutation(overrides: Partial<Mutation> = {}): Mutation {
  return {
    mutation_id: crypto.randomUUID(),
    op: 'upsert',
    table: 'trip_items',
    id: 'i1',
    fields: { quantity: 3 },
    hlc: '0000000001000-0000-abcd1234',
    ...overrides,
  }
}

describe('SyncOutbox', () => {
  let client: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }
  let hlc: HLCGenerator
  let onChanges: (changes: PullChange[]) => void

  beforeEach(() => {
    client = {
      get: vi.fn().mockResolvedValue({
        changes: [],
        next_cursor: 0,
        has_more: false,
      } satisfies PullResponse),
      post: vi.fn().mockResolvedValue({
        results: [],
        pull_hint: { next_cursor: 0 },
      } satisfies PushResponse),
    }
    hlc = mockHLC()
    onChanges = vi.fn()
  })

  it('queues mutations and reports pending count', () => {
    const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges)
    expect(outbox.pendingCount('trip', 'trip-1')).toBe(0)

    outbox.enqueue('trip', 'trip-1', makeMutation())
    expect(outbox.pendingCount('trip', 'trip-1')).toBe(1)

    outbox.enqueue('trip', 'trip-1', makeMutation())
    expect(outbox.pendingCount('trip', 'trip-1')).toBe(2)
  })

  it('drains trip outbox: push then pull', async () => {
    const result: MutationResult = { mutation_id: 'u1', status: 'applied' }
    client.post.mockResolvedValueOnce({
      results: [result],
      pull_hint: { next_cursor: 5 },
    } satisfies PushResponse)

    client.get.mockResolvedValueOnce({
      changes: [{ seq: 5, table: 'trip_items', id: 'i1', deleted: false, row: { name: 'X' } }],
      next_cursor: 5,
      has_more: false,
    } satisfies PullResponse)

    const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges)
    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'u1' }))

    await outbox.drain('trip', 'trip-1')

    expect(client.post).toHaveBeenCalledTimes(1)
    expect(client.get).toHaveBeenCalledTimes(1)
    expect(outbox.pendingCount('trip', 'trip-1')).toBe(0)
    expect(onChanges).toHaveBeenCalled()
  })

  it('drains master outbox', async () => {
    client.post.mockResolvedValueOnce({
      results: [{ mutation_id: 'u2', status: 'applied' }],
      pull_hint: { next_cursor: 10 },
    } satisfies PushResponse)

    client.get.mockResolvedValueOnce({
      changes: [],
      next_cursor: 10,
      has_more: false,
    } satisfies PullResponse)

    const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges)
    outbox.enqueue('master', null, makeMutation({ mutation_id: 'u2', table: 'items' }))

    await outbox.drain('master', null)

    expect(client.post).toHaveBeenCalledWith('/api/v1/sync/master', expect.any(Object))
    expect(outbox.pendingCount('master', null)).toBe(0)
  })

  it('skips push when outbox is empty but still pulls', async () => {
    client.get.mockResolvedValueOnce({
      changes: [{ seq: 3, table: 'trip_items', id: 'i1', deleted: false, row: { name: 'Y' } }],
      next_cursor: 3,
      has_more: false,
    } satisfies PullResponse)

    const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges)
    await outbox.drain('trip', 'trip-1')

    expect(client.post).not.toHaveBeenCalled()
    expect(client.get).toHaveBeenCalledTimes(1)
    expect(onChanges).toHaveBeenCalled()
  })

  it('total pending count across all partitions', () => {
    const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges)
    outbox.enqueue('trip', 'trip-1', makeMutation())
    outbox.enqueue('trip', 'trip-2', makeMutation())
    outbox.enqueue('master', null, makeMutation())
    expect(outbox.totalPending()).toBe(3)
  })
})
