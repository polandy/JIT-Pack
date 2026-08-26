/**
 * FR-5.2/5.3 Packing Now + collision locking (G-3): claiming an item
 * locks it for others, any state transition releases the claim, and
 * stale locks (>15 min) are ignored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useMutations } from '@/composables/useMutations'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { HLCGenerator } from '@/sync/hlc'
import { useTripStore } from '@/stores/tripStore'
import { installHarness } from '@/__tests__/harness'

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
  ;({ fetch: fetchMock } = installHarness())
  wsInstances = []
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

  // FR-5.7 / ADR-028: this asserted the opposite until 2026-08-24 — a
  // claim older than the §7 window stopped locking the row. There is no
  // window now, so age says nothing and the row stays held.
  it('keeps honouring a claim however old it is (FR-5.7)', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'sarah',
      packing_now_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    })

    expect(orch.isLockedByOther('t1', item)).toBe(true)
    expect(orch.lockHolder('t1', item)).toBe('sarah')
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

/**
 * FR-5.7 / ADR-028. A claim is made on a *device* (`myLocks`) because Local
 * and Single-User Mode have no second account to compare against — and that
 * is exactly what a takeover breaks: the server hands the row to somebody
 * else, and the device that lost it must stop believing it still holds one.
 * Found by the `server` e2e project on 2026-08-24: the notification landed
 * on the loser's screen while her row went on saying "You are packing this".
 */
describe('a claim that was taken over (FR-5.7)', () => {
  it('stops being mine when a lock event names another account', async () => {
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      currentUserId: () => 'alice',
    })
    const store = useTripStore()
    const item = seedItem(store)
    await orch.connect()

    orch.packingNow('t1', item)
    const claimed = store.getItems('t1')[0]!
    expect(orch.holdsClaim('t1', claimed)).toBe(true)

    wsInstances[0]!.onmessage!({
      data: JSON.stringify({
        type: 'item.locked',
        payload: { trip_id: 't1', item_id: 'ti1', by_user: 'bob', name: 'Zelt' },
      }),
    })

    const after = store.getItems('t1')[0]!
    expect(orch.holdsClaim('t1', after)).toBe(false)
    expect(orch.lockHolder('t1', after)).toBe('bob')
    expect(orch.isLockedByOther('t1', after)).toBe(true)
  })

  it('stops being mine when the pull names another account, with no event', () => {
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      currentUserId: () => 'alice',
    })
    const store = useTripStore()
    const item = seedItem(store)

    orch.packingNow('t1', item)
    // What a drain after the takeover writes: the server has stamped the
    // taker (invariant 3), and this device may have been offline for the
    // event entirely.
    const taken = seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'bob',
      packing_now_at: new Date().toISOString(),
    })

    expect(orch.lockHolder('t1', taken)).toBe('bob')
    expect(orch.holdsClaim('t1', taken)).toBe(false)
  })

  it('leaves my claim alone when the account is my own', async () => {
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      currentUserId: () => 'alice',
    })
    const store = useTripStore()
    const item = seedItem(store)
    await orch.connect()

    orch.packingNow('t1', item)
    // The hub broadcasts a claim to every subscriber including the claimer,
    // and my own second device is still me — this must not read as a
    // takeover.
    wsInstances[0]!.onmessage!({
      data: JSON.stringify({
        type: 'item.locked',
        payload: { trip_id: 't1', item_id: 'ti1', by_user: 'alice', name: 'Zelt' },
      }),
    })

    const after = store.getItems('t1')[0]!
    expect(orch.holdsClaim('t1', after)).toBe(true)
    expect(orch.lockHolder('t1', after)).toBeNull()
  })

  it('keeps the device rule where there is no identity to compare (Single-User)', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = seedItem(store)
    await orch.connect()

    orch.packingNow('t1', item)
    wsInstances[0]!.onmessage!({
      data: JSON.stringify({
        type: 'item.locked',
        payload: { trip_id: 't1', item_id: 'ti1', by_user: 'e2e-local', name: 'Zelt' },
      }),
    })

    // One account, two devices: the claim belongs to the device that made
    // it, and there is no second person who could have taken it.
    expect(orch.holdsClaim('t1', store.getItems('t1')[0]!)).toBe(true)
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

describe('taking a claim over (FR-5.7)', () => {
  function claimedByOther(store: ReturnType<typeof useTripStore>) {
    return seedItem(store, {
      state: 'packing_now',
      packing_now_by: 'sarah',
      packing_now_at: new Date().toISOString(),
    })
  }

  it('asks the server, because only it can stamp who took over', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/takeover')
          ? new Response(
              JSON.stringify({ ok: true, previous_holder: 'sarah', pull_hint: { next_cursor: 4 } }),
              { status: 200 },
            )
          : new Response(JSON.stringify({ changes: [], pull_hint: { next_cursor: 4 } }), {
              status: 200,
            }),
      ),
    )

    const holder = await orch.takeOverClaim('t1', claimedByOther(store))

    expect(holder).toBe('sarah')
    const calls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls.some((u) => u.endsWith('/api/v1/trips/t1/items/ti1/takeover'))).toBe(true)
  })

  it('leaves the row claimed by me, never free in between', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = claimedByOther(store)
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, previous_holder: 'sarah', pull_hint: { next_cursor: 4 } }),
        { status: 200 },
      ),
    )

    // The positive signal the assertion below needs: before the takeover
    // the row is somebody else's, so "not locked for me" afterwards is
    // the takeover's doing rather than an unread row.
    expect(orch.isLockedByOther('t1', item)).toBe(true)

    await orch.takeOverClaim('t1', item)

    const after = store.getItems('t1')[0]!
    expect(after.state).toBe('packing_now')
    expect(orch.isLockedByOther('t1', after)).toBe(false)
    expect(orch.holdsClaim('t1', after)).toBe(true)
  })

  it('leaves the claim where it was when the server refuses', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const item = claimedByOther(store)
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'claim_not_held', message: 'nobody is packing this row' },
        }),
        {
          status: 409,
        },
      ),
    )

    await expect(orch.takeOverClaim('t1', item)).rejects.toThrow(/nobody is packing/)

    // A refusal that had already moved the row locally would show the
    // taker a claim they do not have.
    expect(orch.holdsClaim('t1', store.getItems('t1')[0]!)).toBe(false)
    expect(orch.isLockedByOther('t1', store.getItems('t1')[0]!)).toBe(true)
  })
})
