/**
 * M13 repack execution (FR-11.1): client-side batch reset preserving
 * the outbound history, trip status transitions via the master
 * partition, and outbox chunking so big batches survive the server's
 * 200-mutation push limit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [],
        pull_hint: { next_cursor: 1 },
        changes: [],
        next_cursor: 1,
        has_more: false,
      }),
      { status: 200 },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', vi.fn())
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function seedTrip(store: ReturnType<typeof useTripStore>) {
  store.applyChange({
    seq: 0,
    table: 'trips',
    id: 't1',
    deleted: false,
    row: { name: 'Engadin', status: 'active', end_date: '2026-08-10' },
  })
}

function seedItem(
  store: ReturnType<typeof useTripStore>,
  id: string,
  row: Record<string, unknown> = {},
) {
  store.applyChange({
    seq: 0,
    table: 'trip_items',
    id,
    deleted: false,
    row: {
      trip_id: 't1',
      name: id,
      quantity: 2,
      packed_count: 2,
      state: 'packed',
      mode: 'pack',
      ...row,
    },
  })
}

describe('startRepack (FR-11.1)', () => {
  it('resets the chosen items, preserves outbound history, and flips the trip to repack', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    seedTrip(store)
    seedItem(store, 'zelt')
    seedItem(store, 'unberührt', { packed_count: 0, state: 'open' })

    orch.startRepack('t1', ['zelt'])

    const zelt = store.getItems('t1').find((i) => i.id === 'zelt')!
    expect(zelt).toMatchObject({ packed_count: 0, state: 'open' })
    expect(store.getItems('t1').find((i) => i.id === 'unberührt')?.state).toBe('open')
    expect(store.getTrip('t1')?.status).toBe('repack')
  })

  it('completeRepack returns the trip to active', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    seedTrip(store)

    orch.startRepack('t1', [])
    orch.completeRepack('t1')

    expect(store.getTrip('t1')?.status).toBe('active')
  })
})

describe('outbox push chunking', () => {
  it('splits batches beyond the server limit of 200 mutations', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    seedTrip(store)
    const ids: string[] = []
    for (let i = 0; i < 250; i++) {
      const id = `item-${i}`
      ids.push(id)
      seedItem(store, id)
    }

    orch.startRepack('t1', ids)
    await vi.waitFor(() => {
      const pushBodies = pushSizes()
      expect(pushBodies.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(250)
    })

    const sizes = pushSizes()
    expect(Math.max(...sizes)).toBeLessThanOrEqual(200)

    function pushSizes(): number[] {
      return fetchMock.mock.calls
        .map((c) => c[1] as RequestInit | undefined)
        .filter((init) => init?.method === 'POST' && init.body)
        .map(
          (init) =>
            (JSON.parse(String(init!.body)) as { mutations?: unknown[] }).mutations?.length ?? 0,
        )
        .filter((n) => n > 0)
    }
  })
})
