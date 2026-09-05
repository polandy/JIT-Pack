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
  // The paths carry the scope first (NFR-4.14, ADR-027), so a trip partition
  // with no id can no longer interpolate as the literal "null" — a path the
  // server answers 404 and the outbox would retry forever. The positive half
  // is asserted beside it, or a builder returning nothing would pass too.
  describe('the partition a push is addressed to', () => {
    it('names the trip', async () => {
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})
      outbox.enqueue('trip', 'trip-1', makeMutation())
      await outbox.drain('trip', 'trip-1')
      expect(client.post).toHaveBeenCalledWith('/api/v1/trips/trip-1/sync', expect.anything())
    })

    it('names the master partition', async () => {
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})
      outbox.enqueue('master', null, makeMutation({ table: 'items' }))
      await outbox.drain('master', null)
      expect(client.post).toHaveBeenCalledWith('/api/v1/master/sync', expect.anything())
    })

    it('refuses a trip partition without a trip id instead of pushing to "null"', async () => {
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})
      outbox.enqueue('trip', null, makeMutation())
      await expect(outbox.drain('trip', null)).rejects.toThrow(/trip id/)
      expect(client.post).not.toHaveBeenCalled()
    })
  })
  let client: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }
  let hlc: HLCGenerator
  let onChanges: (changes: PullChange[]) => void
  let onConflicts: SyncOutboxOptions['onConflicts'] & ReturnType<typeof vi.fn>

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
    onConflicts = vi.fn() as typeof onConflicts
  })

  describe('a merged push (NFR-4.2a)', () => {
    it('reports the fields the server merged away, with the partition they came from', async () => {
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {
        onConflicts,
      })
      const mutation = makeMutation()
      outbox.enqueue('trip', 'trip-1', mutation)
      client.post.mockResolvedValueOnce({
        results: [
          {
            mutation_id: mutation.mutation_id,
            outcome: 'merged',
            conflicts: [
              { field: 'quantity', losing_value: 9, winning_value: 3 },
              { field: 'state', losing_value: 'open', winning_value: 'packed' },
            ],
          },
        ],
        pull_hint: { next_cursor: 7 },
      } satisfies PushResponse)

      await outbox.drain('trip', 'trip-1')

      // The partition travels with the count because it decides which of
      // the two conflict logs the user is being pointed at.
      expect(onConflicts).toHaveBeenCalledWith({ count: 2, type: 'trip', id: 'trip-1' })
    })

    it('says nothing when the server merged nothing', async () => {
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {
        onConflicts,
      })
      const mutation = makeMutation()
      outbox.enqueue('trip', 'trip-1', mutation)
      client.post.mockResolvedValueOnce({
        results: [{ mutation_id: mutation.mutation_id, outcome: 'applied' }],
        pull_hint: { next_cursor: 7 },
      } satisfies PushResponse)

      await outbox.drain('trip', 'trip-1')

      // The positive signal that the drain ran at all, so the silence
      // above is a decision rather than a push that never happened.
      expect(client.post).toHaveBeenCalledTimes(1)
      expect(onConflicts).not.toHaveBeenCalled()
    })

    it('still forgets the mutation — a merge applied, it was not refused', async () => {
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {
        onConflicts,
      })
      const mutation = makeMutation()
      outbox.enqueue('trip', 'trip-1', mutation)
      client.post.mockResolvedValueOnce({
        results: [
          {
            mutation_id: mutation.mutation_id,
            outcome: 'merged',
            conflicts: [{ field: 'quantity', losing_value: 9, winning_value: 3 }],
          },
        ],
        pull_hint: { next_cursor: 7 },
      } satisfies PushResponse)

      await outbox.drain('trip', 'trip-1')

      expect(outbox.totalPending()).toBe(0)
      expect(outbox.parkedCount()).toBe(0)
    })
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
    const result: MutationResult = { mutation_id: 'u1', outcome: 'applied' }
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
      results: [{ mutation_id: 'u2', outcome: 'applied' }],
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

    expect(client.post).toHaveBeenCalledWith('/api/v1/master/sync', expect.any(Object))
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
    /** Every write in the order it ran — the positive signal for ordering. */
    calls: string[] = []

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
      this.calls.push(`remove:${ids.join(',')}`)
      this.pending = this.pending.filter((p) => !ids.includes(p.mutation.mutation_id))
      return Promise.resolve()
    }
    park(partition: string, mutation: Mutation, reason: string, at: number) {
      this.calls.push(`park:${mutation.mutation_id}`)
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
        { mutation_id: 'bad', outcome: 'rejected', error: 'unknown column: trip_items.nope' },
        { mutation_id: 'good', outcome: 'applied' },
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

  it('writes the park before the removal, so a crash between them loses nothing', async () => {
    const store = new FakeStore()
    const outbox = makeOutbox(store)
    client.post.mockResolvedValueOnce({
      results: [
        { mutation_id: 'bad', outcome: 'rejected', error: 'unknown column' },
        { mutation_id: 'good', outcome: 'applied' },
      ],
      pull_hint: { next_cursor: 1 },
    } satisfies PushResponse)

    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'bad' }))
    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'good' }))
    await outbox.drain('trip', 'trip-1')
    await outbox.whenPersisted()

    // The park moves the row between stores in one transaction, so the
    // removal must neither precede it nor name the same id afterwards.
    expect(store.calls).toEqual(['park:bad', 'remove:good'])
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

  it('boots without a durable queue when the device has no usable storage', async () => {
    const store = new FakeStore()
    // A browser with IndexedDB switched off (some private-browsing modes)
    // fails at the *read*, on the boot path — which must degrade to "no
    // durability" rather than take `connect()`, and with it the app, down.
    store.loadPending = () => Promise.reject(new Error('indexedDB is not defined'))
    const durability: boolean[] = []
    const outbox = makeOutbox(store, { onDurabilityChanged: (d) => durability.push(d) })

    await expect(outbox.restore()).resolves.toEqual([])

    expect(durability).toEqual([false])
    expect(outbox.isDurable()).toBe(false)
    // Still a working outbox: it queues and pushes as it always did.
    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'u1' }))
    await outbox.drain('trip', 'trip-1')
    expect(client.post).toHaveBeenCalledTimes(1)
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
  /**
   * `pull_hint.next_cursor` is the highest `change_log.seq` *this push* just
   * wrote (server.go: `if res.Seq > out.PullHint.NextCursor`). Taking it as
   * the pull cursor asks the server for `seq > my-own-latest-write`, which
   * silently skips every row between what this device had applied and what it
   * just wrote — another device's whole session — and the cursor moves past
   * them for good, so they are never offered again (Sync-API §4: the cursor
   * is an exclusive lower bound). The hint says *a pull is worth making*, not
   * *where to start*.
   */
  it('pulls from the cursor it has applied, not from the seq its own push landed at', async () => {
    const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges)

    // This device is caught up to seq 100.
    client.get.mockResolvedValueOnce({
      changes: [],
      next_cursor: 100,
      has_more: false,
    } satisfies PullResponse)
    await outbox.drain('trip', 'trip-1')

    // Meanwhile another device wrote seq 101-110; this one now pushes, and
    // its own row lands at 111.
    client.post.mockResolvedValueOnce({
      results: [{ mutation_id: 'u1', outcome: 'applied' }],
      pull_hint: { next_cursor: 111 },
    } satisfies PushResponse)
    client.get.mockResolvedValueOnce({
      changes: [{ seq: 105, table: 'trip_items', id: 'i9', deleted: false, row: { name: 'X' } }],
      next_cursor: 111,
      has_more: false,
    } satisfies PullResponse)

    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'u1' }))
    await outbox.drain('trip', 'trip-1')

    expect(client.get).toHaveBeenLastCalledWith('/api/v1/trips/trip-1/sync', {
      cursor: '100',
      limit: '500',
    })
  })

  /**
   * The same line the other way round: a push whose mutations all replayed
   * changes nothing, so the server hints 0. Adopting that hint rewinds the
   * cursor to the beginning and re-pulls the entire partition on every drain.
   */
  it('does not rewind its cursor when a push changed nothing', async () => {
    const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges)

    client.get.mockResolvedValueOnce({
      changes: [],
      next_cursor: 100,
      has_more: false,
    } satisfies PullResponse)
    await outbox.drain('trip', 'trip-1')

    client.post.mockResolvedValueOnce({
      results: [{ mutation_id: 'u1', outcome: 'duplicate' }],
      pull_hint: { next_cursor: 0 },
    } satisfies PushResponse)

    outbox.enqueue('trip', 'trip-1', makeMutation({ mutation_id: 'u1' }))
    await outbox.drain('trip', 'trip-1')

    expect(client.get).toHaveBeenLastCalledWith('/api/v1/trips/trip-1/sync', {
      cursor: '100',
      limit: '500',
    })
  })
  describe('one drain at a time per partition', () => {
    /**
     * A promise the test resolves by hand, so "while a drain is running" is a
     * state the test puts the outbox in rather than a moment it hopes to hit.
     */
    function deferred<T>() {
      let settle!: (value: T) => void
      const promise = new Promise<T>((resolve) => {
        settle = resolve
      })
      return { promise, settle }
    }

    const emptyPage: PullResponse = { changes: [], next_cursor: 0, has_more: false }

    it('does not push the same mutation twice when a second drain arrives mid-flight', async () => {
      // Every unawaited `drainMaster()` — the WebSocket `master.changed`
      // handler is one — can land on top of a drain already running.
      const held = deferred<PullResponse>()
      client.get = vi.fn().mockReturnValueOnce(held.promise).mockResolvedValue(emptyPage)
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})
      outbox.enqueue('master', null, makeMutation({ table: 'items' }))

      const first = outbox.drain('master', null)
      const second = outbox.drain('master', null)
      expect(client.post).toHaveBeenCalledTimes(1)

      held.settle(emptyPage)
      await Promise.all([first, second])

      // The queue was emptied by the first drain, so the follow-up has
      // nothing left to send — one push, not two of the same chunk.
      expect(client.post).toHaveBeenCalledTimes(1)
    })

    it('does not pull the same page twice when a second drain arrives mid-flight', async () => {
      const held = deferred<PullResponse>()
      client.get = vi
        .fn()
        .mockReturnValueOnce(held.promise)
        .mockResolvedValue({
          changes: [],
          next_cursor: 500,
          has_more: false,
        } satisfies PullResponse)
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      const first = outbox.drain('master', null)
      const second = outbox.drain('master', null)
      // The second drain has not asked for anything while the first is open.
      expect(client.get).toHaveBeenCalledTimes(1)

      held.settle({
        changes: [{ seq: 500, table: 'items', id: 'i500', deleted: false, row: {} }],
        next_cursor: 500,
        has_more: false,
      })
      await Promise.all([first, second])

      // Two calls, not three: the first drain's page, then the follow-up's
      // own pull from the cursor that page left behind.
      expect(client.get).toHaveBeenCalledTimes(2)
      expect(client.get).toHaveBeenLastCalledWith('/api/v1/master/sync', {
        cursor: '500',
        limit: '500',
      })
    })

    /*
     * Why the second caller waits for a *further* drain instead of simply
     * being handed the running one: a drain works through the snapshot of
     * the queue it took when it started, so a mutation enqueued after that
     * moment is not in it. Handing the running promise back would report
     * that mutation as sent while it had never left the device.
     */
    it('still sends a mutation that was enqueued while a drain was running', async () => {
      const held = deferred<PullResponse>()
      client.get = vi.fn().mockReturnValueOnce(held.promise).mockResolvedValue(emptyPage)
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      const first = outbox.drain('master', null)
      const late = makeMutation({ table: 'items', id: 'late' })
      outbox.enqueue('master', null, late)
      const second = outbox.drain('master', null)

      held.settle(emptyPage)
      await Promise.all([first, second])

      expect(client.post).toHaveBeenCalledTimes(1)
      expect(client.post).toHaveBeenCalledWith(
        '/api/v1/master/sync',
        expect.objectContaining({ mutations: [late] }),
      )
      expect(outbox.pendingCount('master', null)).toBe(0)
    })

    it('coalesces every caller that arrives during one drain into a single follow-up', async () => {
      const held = deferred<PullResponse>()
      client.get = vi.fn().mockReturnValueOnce(held.promise).mockResolvedValue(emptyPage)
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      const drains = [
        outbox.drain('master', null),
        outbox.drain('master', null),
        outbox.drain('master', null),
        outbox.drain('master', null),
      ]

      held.settle(emptyPage)
      await Promise.all(drains)

      expect(client.get).toHaveBeenCalledTimes(2)
    })

    it('lets a different partition drain beside a running one', async () => {
      // The guard is per partition: a trip must not wait behind the master
      // feed, which on a real instance is the long one.
      const held = deferred<PullResponse>()
      client.get = vi.fn().mockReturnValueOnce(held.promise).mockResolvedValue(emptyPage)
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      const master = outbox.drain('master', null)
      await outbox.drain('trip', 'trip-1')

      expect(client.get).toHaveBeenCalledTimes(2)
      held.settle(emptyPage)
      await master
    })

    it('lets the next drain run after one has failed', async () => {
      // A guard that is not released by a rejection would take the partition
      // out of sync for the rest of the session — the failure mode of the
      // fix would be worse than the double work it prevents.
      client.get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(emptyPage)
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      await expect(outbox.drain('master', null)).rejects.toThrow(/offline/)
      await outbox.drain('master', null)

      expect(client.get).toHaveBeenCalledTimes(2)
    })

    it("reports the follow-up drain's own failure to the caller that waited for it", async () => {
      const held = deferred<PullResponse>()
      client.get = vi.fn().mockReturnValueOnce(held.promise).mockRejectedValue(new Error('offline'))
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      const first = outbox.drain('master', null)
      const second = outbox.drain('master', null)

      held.settle(emptyPage)
      await first
      await expect(second).rejects.toThrow(/offline/)
    })
  })

  describe('a partition that does not fit in one page (Sync-API §4)', () => {
    /** A server holding `total` changes, answering `limit` of them per request. */
    function pagedServer(total: number, limit = 500) {
      const asked: number[] = []
      const get = vi.fn((_path: string, params: Record<string, string>) => {
        const cursor = Number(params['cursor'])
        asked.push(cursor)
        const changes: PullChange[] = []
        for (let seq = cursor + 1; seq <= Math.min(cursor + limit, total); seq++) {
          changes.push({ seq, table: 'items', id: `i${seq}`, deleted: false, row: {} })
        }
        const next = cursor + changes.length
        return Promise.resolve({
          changes,
          next_cursor: next,
          has_more: next < total,
        } satisfies PullResponse)
      })
      return { get, asked }
    }

    it('keeps asking until the server says there is no more', async () => {
      const server = pagedServer(717)
      client.get = server.get
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      await outbox.drain('master', null)

      expect(server.asked).toEqual([0, 500])
      const delivered: PullChange[] = (onChanges as ReturnType<typeof vi.fn>).mock.calls.flatMap(
        (c) => c[0] as PullChange[],
      )
      expect(delivered).toHaveLength(717)
      // The last row of the feed is the point: it is the one the trips sat in.
      expect(delivered[delivered.length - 1]).toMatchObject({ seq: 717 })
      expect(outbox.getCursor('master', null)).toBe(717)
    })

    /*
     * Sync-API §3: a pull snapshot is the only place a device meets the clock
     * of a write it did not make, and advancing to it is what keeps a device
     * whose wall clock lags from minting HLCs older than writes it has already
     * seen. The rule was asserted only on the command line's copy
     * — while the drain every browser actually runs had no case at all, which
     * is how the step managed to be dead code for a year (the server was not
     * sending the field) without a single red test.
     */
    it('advances the clock to the clocks the pulled rows carry', async () => {
      const seen = '0000000005000-0001-deadbeef'
      client.get = vi.fn().mockResolvedValue({
        changes: [{ seq: 1, table: 'items', id: 'i1', deleted: false, row: { updated_hlc: seen } }],
        next_cursor: 1,
        has_more: false,
      } satisfies PullResponse)
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      await outbox.drain('master', null)

      expect(hlc.observe).toHaveBeenCalledWith(seen)
    })

    it('keeps the rest of a page whose one clock cannot be parsed', async () => {
      const good = '0000000005000-0001-deadbeef'
      client.get = vi.fn().mockResolvedValue({
        changes: [
          { seq: 1, table: 'items', id: 'i1', deleted: false, row: { updated_hlc: 'not-a-clock' } },
          { seq: 2, table: 'items', id: 'i2', deleted: false, row: { updated_hlc: good } },
        ],
        next_cursor: 2,
        has_more: false,
      } satisfies PullResponse)
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      await outbox.drain('master', null)

      // The unusable value costs its own row and nothing else: the second row
      // is still observed, and the page still reached the stores.
      expect(hlc.observe).toHaveBeenCalledWith(good)
      expect(onChanges).toHaveBeenCalled()
    })

    it('stops rather than spinning when the server does not advance the cursor', async () => {
      // A server that claims more and hands back nothing would otherwise be an
      // infinite loop on the boot path — a hung tab, not a failed request.
      client.get = vi.fn().mockResolvedValue({
        changes: [],
        next_cursor: 0,
        has_more: true,
      } satisfies PullResponse)
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      await outbox.drain('master', null)

      expect(client.get).toHaveBeenCalledTimes(1)
    })

    /*
     * The cursor is deliberately *not* kept on the device, and this is the
     * case that says why: outside Local Mode the pulled rows are not kept
     * either — they live in the Pinia stores and go with the tab. A device
     * that remembered how far it had read and not what it had read would ask
     * for the changes after that point, receive none, and render an empty
     * app. Measured while building this fix: persisting the cursor turned
     * "the first 500 rows" into "no rows at all".
     */
    it('reads the feed from the start again in a new session, because the rows do not persist', async () => {
      const server = pagedServer(717)
      client.get = server.get

      const first = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})
      await first.drain('master', null)
      expect(server.asked).toEqual([0, 500])

      server.asked.length = 0
      const second = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})
      await second.drain('master', null)

      expect(server.asked).toEqual([0, 500])
    })

    it('keeps a partly-pulled feed rather than losing the pages already taken', async () => {
      // A phone that loses the network mid-feed: the pages that arrived are
      // applied, and the next drain in the same session continues from the
      // last one instead of asking for the whole thing again.
      const TOTAL = 3
      let calls = 0
      const asked: number[] = []
      client.get = vi.fn((_path: string, params: Record<string, string>) => {
        calls++
        const cursor = Number(params['cursor'])
        asked.push(cursor)
        if (calls === 2) return Promise.reject(new Error('offline'))
        const seq = cursor + 1
        return Promise.resolve({
          changes:
            seq <= TOTAL ? [{ seq, table: 'items', id: `i${seq}`, deleted: false, row: {} }] : [],
          next_cursor: Math.min(seq, TOTAL),
          has_more: seq < TOTAL,
        } satisfies PullResponse)
      })
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      await expect(outbox.drain('master', null)).rejects.toThrow(/offline/)
      expect(outbox.getCursor('master', null)).toBe(1)

      await outbox.drain('master', null)

      // It resumed at 1 rather than starting over at 0.
      expect(asked).toEqual([0, 1, 1, 2])
      expect(outbox.getCursor('master', null)).toBe(TOTAL)
    })

    it('pages a trip partition by the same rule', async () => {
      const server = pagedServer(1200)
      client.get = server.get
      const outbox = new SyncOutbox(client as unknown as APIClient, hlc, onChanges, {})

      await outbox.drain('trip', 'trip-1')

      expect(server.asked).toEqual([0, 500, 1000])
      expect(outbox.getCursor('trip', 'trip-1')).toBe(1200)
    })
  })
})

/**
 * A partition bigger than one page (Sync-API §4).
 *
 * The pull asked once, ignored `has_more`, and kept its cursor in a plain
 * `Map` that a reload threw away — so an instance of 717 master rows served
 * a browser the same first 500 for ever, and the trips (which sit behind
 * them in `change_log`) were never delivered at all. Measured on the family
 * instance 2026-08-25; the sync indicator was green throughout.
 */
