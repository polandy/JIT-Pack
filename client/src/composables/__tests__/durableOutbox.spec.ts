/**
 * The durable outbox as the app uses it (B2, NFR-4.1): a queue an earlier
 * session left on the device is replayed on connect — before the first pull
 * — and the G-2 status says how much is waiting, so a reload no longer looks
 * like an all-clear.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import type { Mutation, PullResponse, PushResponse } from '@/api/types'
import type { OutboxStore, ParkedMutation, PendingMutation } from '@/sync/outboxStore'
import { REJECTION_REASON } from '@/sync/rejectionReasons'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  // A class, not `vi.fn(() => ({…}))`: these cases actually run `connect()`,
  // which does `new WebSocket(...)`, and an arrow function cannot be
  // constructed — it surfaces as an unhandled TypeError rather than a
  // failure, which is worse than a red test.
  vi.stubGlobal(
    'WebSocket',
    class {
      readyState = 1
      send() {}
      close() {}
    },
  )
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

/** In-memory OutboxStore standing in for the device's IndexedDB. */
class FakeStore implements OutboxStore {
  constructor(
    public pending: PendingMutation[] = [],
    public parked: ParkedMutation[] = [],
  ) {}
  loadPending() {
    return Promise.resolve([...this.pending])
  }
  append(partition: string, mutation: Mutation) {
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

function queued(id: string): Mutation {
  return {
    mutation_id: id,
    op: 'upsert',
    table: 'trip_items',
    id: 'i1',
    fields: { packed_count: 1, state: 'packed' },
    hlc: '0000000001000-0000-abcd1234',
  }
}

function jsonOnce(body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }))
}

describe('durable outbox on boot', () => {
  it('replays what an earlier session queued, before this one pulls anything', async () => {
    const store = new FakeStore([{ partition: 'trip:trip-1', mutation: queued('u1') }])
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      outboxStore: store,
    })

    // No notifications endpoint answer needed for the assertions below —
    // the push and the pull of the restored partition are what must happen.
    jsonOnce({
      results: [{ mutation_id: 'u1', outcome: 'duplicate' }],
      pull_hint: { next_cursor: 4 },
    })
    jsonOnce({ changes: [], next_cursor: 4, has_more: false } satisfies PullResponse)

    await orch.connect()

    const [pushUrl, pushInit] = fetchMock.mock.calls[0]!
    expect(String(pushUrl)).toContain('/api/v1/trips/trip-1/sync')
    expect(pushInit.method).toBe('POST')
    expect(JSON.parse(pushInit.body).mutations[0].mutation_id).toBe('u1')

    // The pull follows it — call order is the proof — and carries the cursor
    // this device has applied, which on a first boot is 0. It deliberately
    // does *not* carry the push's `pull_hint`: that is the seq the push just
    // wrote, and starting there would skip every earlier change this device
    // has never seen.
    expect(String(fetchMock.mock.calls[1]![0])).toContain('cursor=0')

    expect(orch.syncStatus.pendingCount.value).toBe(0)
    expect(store.pending).toEqual([])
  })

  it('reports the restored queue as still waiting while the device is offline', async () => {
    const store = new FakeStore([{ partition: 'trip:trip-1', mutation: queued('u1') }])
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      outboxStore: store,
    })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await orch.connect()

    expect(orch.syncStatus.pendingCount.value).toBe(1)
    expect(orch.syncStatus.state.value).toBe('offline')
    // Still on the device: an offline boot must not consume the queue.
    expect(store.pending).toHaveLength(1)
  })

  it('counts mutations the server parked so G-2 can name them', async () => {
    const store = new FakeStore(
      [],
      [
        {
          partition: 'trip:trip-1',
          mutation: queued('bad'),
          reason: 'unknown column',
          at: 1,
        },
      ],
    )
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      outboxStore: store,
    })
    jsonOnce({ changes: [], next_cursor: 0, has_more: false } satisfies PullResponse)

    await orch.connect()

    expect(orch.syncStatus.parkedCount.value).toBe(1)
  })

  /**
   * The count alone could not be acted on: the refusal the server sent had a
   * reason since Sync-API §5, and nothing carried it as far as G-2. This is
   * the whole path — push answer → parked entry → status → the sheet's prop.
   */
  it('carries the reason of the refusal all the way to the status', async () => {
    const store = new FakeStore([{ partition: 'trip:trip-1', mutation: queued('u1') }])
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      outboxStore: store,
    })
    jsonOnce({
      results: [
        {
          mutation_id: 'u1',
          outcome: 'rejected',
          error: REJECTION_REASON.stillReferenced,
        },
      ],
      pull_hint: { next_cursor: 0 },
    })
    jsonOnce({ changes: [], next_cursor: 0, has_more: false } satisfies PullResponse)

    await orch.connect()

    expect(orch.syncStatus.parkedCount.value).toBe(1)
    expect(orch.syncStatus.parkedReason.value).toBe(REJECTION_REASON.stillReferenced)
  })

  it('remembers the reason of a refusal an earlier session parked', async () => {
    const store = new FakeStore(
      [],
      [
        {
          partition: 'master',
          mutation: queued('old'),
          reason: REJECTION_REASON.notAuthorized,
          at: 1,
        },
        {
          partition: 'master',
          mutation: queued('newer'),
          reason: REJECTION_REASON.stillReferenced,
          at: 2,
        },
      ],
    )
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      outboxStore: store,
    })
    jsonOnce({ changes: [], next_cursor: 0, has_more: false } satisfies PullResponse)

    await orch.connect()

    expect(orch.syncStatus.parkedCount.value).toBe(2)
    // The newest, not the first: what the sheet says has to be the refusal
    // the user most recently caused.
    expect(orch.syncStatus.parkedReason.value).toBe(REJECTION_REASON.stillReferenced)
  })

  it('withdraws the durability promise when the device refuses the write', async () => {
    const store = new FakeStore()
    store.append = () => Promise.reject(new DOMException('quota', 'QuotaExceededError'))
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      outboxStore: store,
    })
    jsonOnce({ results: [], pull_hint: { next_cursor: 0 } } satisfies PushResponse)
    jsonOnce({ changes: [], next_cursor: 0, has_more: false } satisfies PullResponse)

    orch.packComplete('trip-1', {
      id: 'i1',
      trip_id: 'trip-1',
      quantity: 1,
      packed_count: 0,
      state: 'open',
    } as Parameters<typeof orch.packComplete>[1])
    await orch.outbox.whenPersisted()

    expect(orch.syncStatus.queueDurable.value).toBe(false)
    // The mutation is not lost, only undurable: it is still queued.
    expect(orch.outbox.totalPending() + orch.syncStatus.pendingCount.value).toBeGreaterThan(0)
  })
})
