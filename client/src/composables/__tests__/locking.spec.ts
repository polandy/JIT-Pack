/**
 * FR-5.2/5.3 Packing Now + collision locking (G-3): claiming an item
 * locks it for others, any state transition releases the claim, and
 * stale locks (>15 min) are ignored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useMutations } from '@/composables/useMutations'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { HLCGenerator } from '@/sync/hlc'
import { useTripStore } from '@/stores/tripStore'

interface WSStub {
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  readyState: number
  onopen: (() => void) | null
  onmessage: ((ev: { data: string }) => void) | null
  onclose: (() => void) | null
}

let fetchMock: ReturnType<typeof vi.fn>
let wsInstances: WSStub[]

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ results: [], pull_hint: { next_cursor: 1 } }), { status: 200 }),
    )
  wsInstances = []
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', function () {
    const inst: WSStub = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
      onopen: null,
      onmessage: null,
      onclose: null,
    }
    wsInstances.push(inst)
    return inst
  } as unknown as typeof WebSocket)
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function seedItem(store: ReturnType<typeof useTripStore>, row: Record<string, unknown> = {}) {
  store.applyChange({
    seq: 0,
    table: 'trip_items',
    id: 'ti1',
    deleted: false,
    row: {
      trip_id: 't1',
      name: 'Zelt',
      quantity: 1,
      packed_count: 0,
      state: 'open',
      mode: 'pack',
      ...row,
    },
  })
  return store.getItems('t1')[0]!
}

describe('packing-now mutations', () => {
  const mutations = useMutations(new HLCGenerator(() => Date.now(), 'aabbccdd'))

  it('startPackingNow claims the item with a timestamp', () => {
    const mut = mutations.startPackingNow('ti1')

    expect(mut.fields!['state']).toBe('packing_now')
    expect(mut.fields!['packing_now_at']).toBeTruthy()
  })

  it('any pack transition releases the claim (FR-5.3)', () => {
    const mut = mutations.completePacked('ti1', 3)

    expect(mut.fields).toMatchObject({
      state: 'packed',
      packing_now_by: null,
      packing_now_at: null,
    })
  })
})

describe('lock state (G-3)', () => {
  it('own packing-now claim never locks the item for me', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store)

    orch.packingNow('t1', item)

    const claimed = store.getItems('t1')[0]!
    expect(claimed.state).toBe('packing_now')
    expect(orch.isLockedByOther('t1', claimed)).toBe(false)
  })

  it('foreign ephemeral lock events lock and unlock the item', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store)
    await orch.connect()

    wsInstances[0]!.onmessage!({
      data: JSON.stringify({
        type: 'item.locked',
        payload: { trip_id: 't1', item_id: 'ti1', by_user: 'sarah', name: 'Zelt' },
      }),
    })
    expect(orch.isLockedByOther('t1', item)).toBe(true)

    wsInstances[0]!.onmessage!({
      data: JSON.stringify({
        type: 'item.unlocked',
        payload: { trip_id: 't1', item_id: 'ti1', by_user: 'sarah', name: 'Zelt' },
      }),
    })
    expect(orch.isLockedByOther('t1', item)).toBe(false)
  })

  it('locks items whose synced state is packing_now by someone else', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'sarah',
      packing_now_at: new Date().toISOString(),
    })

    expect(orch.isLockedByOther('t1', item)).toBe(true)
  })

  it('ignores stale locks older than 15 minutes (§7 timeout rule)', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    const item = seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'sarah',
      packing_now_at: stale,
    })

    expect(orch.isLockedByOther('t1', item)).toBe(false)
  })
})

describe('who holds the lock (G-3)', () => {
  it('names the holder from the synced packing_now_by', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'sarah',
      packing_now_at: new Date().toISOString(),
    })

    expect(orch.lockHolder('t1', item)).toBe('sarah')
  })

  it('names the holder from the ephemeral event before the pull lands', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store)
    await orch.connect()

    wsInstances[0]!.onmessage!({
      data: JSON.stringify({
        type: 'item.locked',
        payload: { trip_id: 't1', item_id: 'ti1', by_user: 'sarah', name: 'Zelt' },
      }),
    })

    expect(orch.lockHolder('t1', item)).toBe('sarah')
  })

  it('names nobody for a row that is not locked for me', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store)

    orch.packingNow('t1', item)

    expect(orch.lockHolder('t1', store.getItems('t1')[0]!)).toBeNull()
  })
})

describe('a claim that expired (G-3)', () => {
  it('names the abandoned claim, because the row going quiet explains nothing', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'sarah',
      packing_now_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    })

    // The row is operable again — that half already worked. What did not
    // is *saying so*: it simply stopped being locked, and whoever was
    // waiting for it had no way to tell that from never having looked.
    expect(orch.isLockedByOther('t1', item)).toBe(false)
    expect(orch.staleClaim('t1', item)).toBe('sarah')
  })

  it('says nothing about a claim that is still inside the window', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'sarah',
      packing_now_at: new Date().toISOString(),
    })

    // The positive signal that the claim is seen at all, so the null below
    // is the window's doing rather than an unread row.
    expect(orch.lockHolder('t1', item)).toBe('sarah')
    expect(orch.staleClaim('t1', item)).toBeNull()
  })

  it('says nothing about a claim of my own, however old', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store)

    orch.packingNow('t1', item)

    expect(orch.staleClaim('t1', store.getItems('t1')[0]!)).toBeNull()
  })

  it('says nothing about a row nobody claimed', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()

    expect(orch.staleClaim('t1', seedItem(store))).toBeNull()
  })
})

describe('my own claim (G-3)', () => {
  it('is reported to me, because nothing else on the row can be', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store)

    orch.packingNow('t1', item)

    const claimed = store.getItems('t1')[0]!
    // Both halves: the row is not locked *for me* — that is what makes it
    // usable — and it is nonetheless being held by me against the others.
    expect(orch.lockHolder('t1', claimed)).toBeNull()
    expect(orch.holdsClaim('t1', claimed)).toBe(true)
  })

  it('stops being reported once the row is released', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store)

    orch.packingNow('t1', item)
    orch.releaseClaim('t1', store.getItems('t1')[0]!)

    expect(orch.holdsClaim('t1', store.getItems('t1')[0]!)).toBe(false)
  })

  it('is not claimed by a row somebody else holds', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'sarah',
      packing_now_at: new Date().toISOString(),
    })

    expect(orch.holdsClaim('t1', item)).toBe(false)
  })
})

describe('releasing a claim (G-3)', () => {
  it('gives the row back without packing it, and to the state it came from', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store, { quantity: 3, packed_count: 1 })

    orch.packingNow('t1', item)
    orch.releaseClaim('t1', store.getItems('t1')[0]!)

    const after = store.getItems('t1')[0]!
    // Partial, not open: one of the three is already in the bag, and a
    // release that forgot that would undo somebody's work.
    expect(after.state).toBe('partial')
    expect(after.packed_count).toBe(1)
    expect(after.packing_now_by).toBeNull()
    expect(after.packing_now_at).toBeNull()
  })

  it('returns an untouched row to open', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store, { quantity: 2, packed_count: 0 })

    orch.packingNow('t1', item)
    orch.releaseClaim('t1', store.getItems('t1')[0]!)

    expect(store.getItems('t1')[0]!.state).toBe('open')
  })

  it('unlocks the row for the other devices, which is the point of it', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store)

    orch.packingNow('t1', item)
    orch.releaseClaim('t1', store.getItems('t1')[0]!)

    // Asserted on the row the other devices would read, not on the local
    // `myLocks` bookkeeping — that one never locked it for me anyway.
    expect(store.getItems('t1')[0]!.state).not.toBe('packing_now')
  })
})

describe('the staleness window comes from the server (Sync-API §7)', () => {
  it('applies the instance window instead of the built-in 15 minutes', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/api/v1/config')
          ? new Response(JSON.stringify({ lock_timeout_seconds: 60 }), { status: 200 })
          : new Response(JSON.stringify({ results: [], pull_hint: { next_cursor: 1 } }), {
              status: 200,
            }),
      ),
    )
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'sarah',
      // Five minutes old: stale under a 60-second window, fresh under
      // the built-in default — so this can only pass if the server's
      // value actually reached the rule.
      packing_now_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    })
    expect(orch.isLockedByOther('t1', item)).toBe(true)

    await orch.fetchLockTimeout()

    expect(orch.isLockedByOther('t1', item)).toBe(false)
  })

  it('keeps the 15-minute default when the instance does not answer', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'sarah',
      packing_now_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    })

    await orch.fetchLockTimeout()

    expect(orch.isLockedByOther('t1', item)).toBe(true)
  })
})
