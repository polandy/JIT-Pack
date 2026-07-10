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
  fetchMock = vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ results: [], pull_hint: { next_cursor: 1 } }), { status: 200 },
  ))
  wsInstances = []
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', function () {
    const inst: WSStub = {
      send: vi.fn(), close: vi.fn(), readyState: 1,
      onopen: null, onmessage: null, onclose: null,
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
    seq: 0, table: 'trip_items', id: 'ti1', deleted: false,
    row: { trip_id: 't1', name: 'Zelt', quantity: 1, packed_count: 0, state: 'open', mode: 'pack', ...row },
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
      state: 'packing_now', packing_now_by: 'sarah',
      packing_now_at: new Date().toISOString(),
    })

    expect(orch.isLockedByOther('t1', item)).toBe(true)
  })

  it('ignores stale locks older than 15 minutes (§7 timeout rule)', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    const item = seedItem(store, {
      state: 'packing_now', packing_now_by: 'sarah', packing_now_at: stale,
    })

    expect(orch.isLockedByOther('t1', item)).toBe(false)
  })
})
