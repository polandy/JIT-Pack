/**
 * A refusal repairs the row it refused (Sync-API §5, ADR-031).
 *
 * Before this, a rejected mutation left the device permanently diverged:
 * the row rendered optimistically, the push was refused, the outbox dropped
 * the mutation per P-5 — and the optimistic row stayed on screen forever,
 * because the server row had not changed and its change_log entry was
 * already behind this device's cursor.
 *
 * Two halves, split by what the server can and cannot send:
 *  - the server re-logs the row, and the drain's own pull applies it;
 *  - `out_of_scope` is the one refusal it cannot re-log (the row is another
 *    trip's, and an entry here would leak it), so the client drops it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { REJECTION_REASON } from '@/sync/rejectionReasons'
import { TABLE } from '@/types/tables'
import type { Mutation, PullResponse } from '@/api/types'
import type { OutboxStore, ParkedMutation, PendingMutation } from '@/sync/outboxStore'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
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

const TRIP = 'trip-1'
const ITEM = 'ti-1'

/** The mutation an earlier session queued — a rename of one trip item. */
function queuedRename(id: string): Mutation {
  return {
    mutation_id: id,
    op: 'upsert',
    table: TABLE.tripItems,
    id: ITEM,
    fields: { trip_id: TRIP, name: 'Umbenannt' },
    hlc: '0000000001000-0000-abcd1234',
  }
}

function jsonOnce(body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }))
}

/** The optimistic row this device is showing while the push is out. */
function optimisticRow(name: string) {
  return {
    seq: 0,
    table: TABLE.tripItems,
    id: ITEM,
    deleted: false,
    row: { trip_id: TRIP, name, quantity: 1, packed_count: 0, state: 'open', mode: 'pack' },
  }
}

function rejectedPush(reason: string) {
  return {
    results: [{ mutation_id: 'u1', outcome: 'rejected', error: reason }],
    pull_hint: { next_cursor: 7 },
  }
}

describe('a refused mutation stops diverging the device', () => {
  /**
   * The server's half: the refusal re-logged the row, so the pull the same
   * drain makes carries the server's own snapshot and it replaces the
   * optimistic one. The client does nothing clever here — the point is that
   * it does not get in the way.
   */
  it('lets the repair the server re-logged replace the optimistic row', async () => {
    const store = new FakeStore([{ partition: `trip:${TRIP}`, mutation: queuedRename('u1') }])
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      outboxStore: store,
    })
    const trips = useTripStore()
    trips.applyChanges([optimisticRow('Umbenannt')])

    jsonOnce(rejectedPush(REJECTION_REASON.notAuthorized))
    jsonOnce({
      changes: [{ ...optimisticRow('Wie der Server sie kennt'), seq: 7 }],
      next_cursor: 7,
      has_more: false,
    } satisfies PullResponse)

    await orch.connect()

    expect(trips.getItems(TRIP).map((i) => i.name)).toEqual(['Wie der Server sie kennt'])
  })

  /**
   * The client's half. `out_of_scope` says the row belongs to another trip,
   * so the server cannot re-log it into this partition without handing over
   * a foreign snapshot — and the pull below is therefore empty. The device
   * still has to stop showing the row, and it can: a row it may not touch
   * here is a row it must not keep here.
   */
  it('drops the row itself when the server says it was never this trip', async () => {
    const store = new FakeStore([{ partition: `trip:${TRIP}`, mutation: queuedRename('u1') }])
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      outboxStore: store,
    })
    const trips = useTripStore()
    trips.applyChanges([optimisticRow('Fremde Zeile')])

    jsonOnce(rejectedPush(REJECTION_REASON.outOfScope))
    jsonOnce({ changes: [], next_cursor: 7, has_more: false } satisfies PullResponse)

    await orch.connect()

    expect(trips.getItems(TRIP)).toEqual([])
  })

  /**
   * The positive signal beside the case above: the same empty pull after a
   * refusal the server *does* repair leaves the row alone. Without this,
   * "the row is gone" would be provable by dropping every refused row —
   * which would delete rows the server is about to send back.
   */
  it('keeps the row for a refusal the server repairs, even before the repair arrives', async () => {
    const store = new FakeStore([{ partition: `trip:${TRIP}`, mutation: queuedRename('u1') }])
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      outboxStore: store,
    })
    const trips = useTripStore()
    trips.applyChanges([optimisticRow('Noch da')])

    jsonOnce(rejectedPush(REJECTION_REASON.stillReferenced))
    jsonOnce({ changes: [], next_cursor: 7, has_more: false } satisfies PullResponse)

    await orch.connect()

    expect(trips.getItems(TRIP).map((i) => i.name)).toEqual(['Noch da'])
  })

  /**
   * Undoing a change without saying so is its own defect: the row simply
   * changes back under the user's hands. G-2's sheet carries the standing
   * record; this is the one signal that arrives when it happens.
   */
  it('reports the refusal once per push, so the user is told it was undone', async () => {
    const store = new FakeStore([{ partition: `trip:${TRIP}`, mutation: queuedRename('u1') }])
    const seen: { count: number; reason: string }[] = []
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      outboxStore: store,
      onRejections: (report) => seen.push({ count: report.count, reason: report.reason }),
    })

    jsonOnce(rejectedPush(REJECTION_REASON.stillReferenced))
    jsonOnce({ changes: [], next_cursor: 7, has_more: false } satisfies PullResponse)

    await orch.connect()

    expect(seen).toEqual([{ count: 1, reason: REJECTION_REASON.stillReferenced }])
  })
})
