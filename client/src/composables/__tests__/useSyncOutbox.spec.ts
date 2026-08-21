import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncOutbox, type SyncOutboxOptions } from '../useSyncOutbox'
import type { Mutation, PushResponse, MutationResult, PullResponse, PullChange } from '@/api/types'
import { APIRequestError, type APIClient } from '@/api/client'
import type { HLCGenerator } from '@/sync/hlc'
import type { OutboxStore, ParkedMutation, PendingMutation } from '@/sync/outboxStore'

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

/**
 * Durability (B2, NFR-4.1): the queue lives on the device, replays on boot,
 * and a mutation the server will never accept is parked rather than pushed
 * forever. The store is a hand-written fake behind the consumer-side
 * `OutboxStore` interface — the real IndexedDB one has its own unit.
 */
describe('SyncOutbox durability', () => {
  let client: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }
  let hlc: HLCGenerator
  let onChanges: (changes: PullChange[]) => void

  /** In-memory OutboxStore, with a switch for the write the browser refuses. */
  class FakeStore implements OutboxStore {
    pending: PendingMutation[] = []
    parked: ParkedMutation[] = []
    /** When set, the next append rejects with it (quota, aborted tx, …). */
    failAppendWith: Error | null = null

    loadPending() {
      return Promise.resolve([...this.pending])
    }
    append(partition: string, mutation: Mutation) {
      if (this.failAppendWith) {
        const err = this.failAppendWith
        this.failAppendWith = null
        return Promise.reject(err)
      }
      this.pending.push({ partition, mutation })
      return Promise.resolve()
    }
    remove(ids: string[]) {
      this.pending = this.pending.filter((p) => !ids.includes(p.mutation.mutation_id))
      return Promise.resolve()
    }
    park(partition: string, mutation: Mutation, reason: string, at: number) {
      this.pending = this.pending.filter((p) => p.mutation.mutation_id !== mutation.mutation_id)
      this.parked.push({ partition, mutation, reason, at })
      return Promise.resolve()
    }
    loadParked() {
      return Promise.resolve([...this.parked])
    }
    whenSettled() {
      return Promise.resolve()
    }
  }

  function makeOutbox(store: OutboxStore, opts: Partial<SyncOutboxOptions> = {}) {
    return new SyncOutbox(client as unknown as APIClient, hlc, onChanges, { store, ...opts })
  }

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

  it('replays a queue an earlier session left behind, before anything is pulled', async () => {
    const store = new FakeStore()
    const first = makeOutbox(store)
    first.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'u1' }))
    first.enqueue('master', null, makeMutation({ mutation_id: 'u2', table: 'items' }))
    await first.whenPersisted()

    // A new process: nothing in memory, everything still on the device.
    const second = makeOutbox(store)
    expect(second.totalPending()).toBe(0)
    const partitions = await second.restore()

    expect(second.totalPending()).toBe(2)
    expect(second.pendingCount('trip', 'trip-1')).toBe(1)
    expect(second.pendingCount('master', null)).toBe(1)
    expect(partitions).toEqual([
      { type: 'trip', id: 'trip-1' },
      { type: 'master', id: null },
    ])
    // Restoring must not talk to the server — the drain does that.
    expect(client.post).not.toHaveBeenCalled()
    expect(client.get).not.toHaveBeenCalled()
  })

  it('forgets a mutation on the device only once the server has acknowledged it', async () => {
    const store = new FakeStore()
    const outbox = makeOutbox(store)
    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'u1' }))
    await outbox.whenPersisted()
    expect(store.pending).toHaveLength(1)

    await outbox.drain('trip', 'trip-1')
    await outbox.whenPersisted()

    expect(store.pending).toEqual([])
    expect(await makeOutbox(store).restore()).toEqual([])
  })

  it('parks a mutation the server rejects and pushes the rest of the batch', async () => {
    const store = new FakeStore()
    const parked: ParkedMutation[] = []
    const outbox = makeOutbox(store, { onParked: (e) => parked.push(e), now: () => 1234 })
    client.post.mockResolvedValueOnce({
      results: [
        { mutation_id: 'bad', status: 'rejected', error: 'unknown column: trip_items.nope' },
        { mutation_id: 'good', status: 'applied' },
      ],
      pull_hint: { next_cursor: 7 },
    } satisfies PushResponse)

    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'bad' }))
    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'good' }))
    await outbox.drain('trip', 'trip-1')
    await outbox.whenPersisted()

    expect(outbox.pendingCount('trip', 'trip-1')).toBe(0)
    expect(store.pending).toEqual([])
    expect(store.parked).toEqual([
      {
        partition: 'trip:trip-1',
        mutation: expect.objectContaining({ mutation_id: 'bad' }),
        reason: 'unknown column: trip_items.nope',
        at: 1234,
      },
    ])
    expect(parked).toHaveLength(1)
    expect(outbox.parkedCount()).toBe(1)
  })

  it('parks a batch the server permanently refuses instead of wedging the queue', async () => {
    const store = new FakeStore()
    const outbox = makeOutbox(store)
    client.post.mockRejectedValueOnce(
      new APIRequestError(422, { code: 'validation', message: 'malformed push envelope' }),
    )

    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'u1' }))
    await outbox.drain('trip', 'trip-1')
    await outbox.whenPersisted()

    expect(outbox.pendingCount('trip', 'trip-1')).toBe(0)
    expect(store.parked.map((p) => p.reason)).toEqual(['malformed push envelope'])
    // The positive signal that the queue is not wedged: the pull still ran
    // this cycle, and the next cycle has nothing left to push.
    expect(client.get).toHaveBeenCalledTimes(1)
    client.post.mockClear()
    await outbox.drain('trip', 'trip-1')
    expect(client.post).not.toHaveBeenCalled()
  })

  it('keeps a batch queued when the push failed for a reason a retry can fix', async () => {
    const store = new FakeStore()
    const outbox = makeOutbox(store)
    client.post.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'u1' }))
    await expect(outbox.drain('trip', 'trip-1')).rejects.toThrow('Failed to fetch')
    await outbox.whenPersisted()

    expect(outbox.pendingCount('trip', 'trip-1')).toBe(1)
    expect(store.parked).toEqual([])
    // It is still a queue, not a graveyard: the next drain re-pushes it.
    await outbox.drain('trip', 'trip-1')
    expect(client.post).toHaveBeenCalledTimes(2)
    expect(outbox.pendingCount('trip', 'trip-1')).toBe(0)
  })

  it('a 5xx keeps the batch queued — the server is not refusing it, it is failing', async () => {
    const store = new FakeStore()
    const outbox = makeOutbox(store)
    client.post.mockRejectedValueOnce(new APIRequestError(500, null))

    outbox.enqueue('master', null, makeMutation({ mutation_id: 'u1', table: 'items' }))
    await expect(outbox.drain('master', null)).rejects.toBeDefined()

    expect(outbox.pendingCount('master', null)).toBe(1)
    expect(store.parked).toEqual([])
  })

  it('still queues and pushes when the device has no room to store the mutation', async () => {
    const store = new FakeStore()
    const durability: boolean[] = []
    const outbox = makeOutbox(store, { onDurabilityChanged: (d) => durability.push(d) })
    store.failAppendWith = new DOMException('quota exceeded', 'QuotaExceededError')

    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'u1' }))
    await outbox.whenPersisted()

    // Losing durability must never lose the mutation: it is still queued,
    // still pushed, and the loss is announced so G-2 stops promising it.
    expect(outbox.pendingCount('trip', 'trip-1')).toBe(1)
    expect(durability).toEqual([false])
    expect(outbox.isDurable()).toBe(false)

    await outbox.drain('trip', 'trip-1')
    expect(client.post).toHaveBeenCalledTimes(1)

    // And it recovers: a write that lands again restores the promise.
    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'u2' }))
    await outbox.whenPersisted()
    expect(durability).toEqual([false, true])
    expect(outbox.isDurable()).toBe(true)
  })
})
