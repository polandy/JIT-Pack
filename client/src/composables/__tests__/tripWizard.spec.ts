/**
 * M3 wizard write path: trip creation cascade (trips → master partition,
 * travelers/trip_items → trip partition) with per-traveler assignment
 * and FR-5.5 skipped state for quantity-zero items.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useMutations } from '../useMutations'
import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { HLCGenerator } from '@/sync/hlc'
import { useTripStore } from '@/stores/tripStore'
import type { GeneratedItem } from '@/domain/instantiate'
import type { PullResponse, PushResponse } from '@/api/types'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal(
    'WebSocket',
    vi.fn(() => ({
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
      onopen: null,
      onmessage: null,
      onclose: null,
    })),
  )
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function mockPush() {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ results: [], pull_hint: { next_cursor: 1 } } satisfies PushResponse),
      { status: 200 },
    ),
  )
}

function mockPull() {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ changes: [], next_cursor: 1, has_more: false } satisfies PullResponse),
      { status: 200 },
    ),
  )
}

function generated(overrides: Partial<GeneratedItem> = {}): GeneratedItem {
  return {
    source_item_id: 'i1',
    source_template_id: 't1',
    name: 'Socken',
    category_name: 'Kleidung',
    weight_grams: 80,
    value_cents: null,
    quantity: 4,
    mode: 'pack',
    late_packer: false,
    traveler_index: null,
    ...overrides,
  }
}

describe('useMutations wizard additions', () => {
  const mutations = useMutations(new HLCGenerator(() => Date.now(), 'aabbccdd'))

  it('addTraveler builds a travelers insert on the trip partition', () => {
    const { mutation } = mutations.addTraveler('trip-1', 'Ronja', 'child')

    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('travelers')
    expect(mutation.fields).toMatchObject({
      trip_id: 'trip-1',
      name: 'Ronja',
      profile: 'child',
      linked_user_id: null,
    })
  })

  it('addGeneratedTripItem carries all generation fields', () => {
    const { mutation } = mutations.addGeneratedTripItem('trip-1', generated(), 'trav-1')

    expect(mutation.table).toBe('trip_items')
    expect(mutation.fields).toMatchObject({
      trip_id: 'trip-1',
      name: 'Socken',
      source_item_id: 'i1',
      source_template_id: 't1',
      category_name: 'Kleidung',
      weight_grams: 80,
      quantity: 4,
      packed_count: 0,
      state: 'open',
      mode: 'pack',
      late_packer: 0,
      assigned_traveler_id: 'trav-1',
    })
  })

  it('marks quantity-zero items as consciously skipped (FR-5.5)', () => {
    const { mutation } = mutations.addGeneratedTripItem('trip-1', generated({ quantity: 0 }), null)

    expect(mutation.fields).toMatchObject({ quantity: 0, state: 'skipped' })
  })
})

describe('createTripFromWizard', () => {
  it('creates trip, travelers, and items optimistically with traveler assignment', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()
    mockPush()
    mockPull()
    mockPush()
    mockPull()

    const tripId = orch.createTripFromWizard({
      name: 'Engadin',
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      attributes: { season: 'summer' },
      travelers: [
        { name: 'Andy', profile: 'adult' },
        { name: 'Ronja', profile: 'child' },
      ],
      items: [
        generated({ traveler_index: 0, quantity: 5 }),
        generated({ traveler_index: 1, quantity: 3 }),
        generated({ source_item_id: 'i2', name: 'Zelt', quantity: 1 }),
      ],
    })

    const trip = tripStore.getTrip(tripId)
    expect(trip?.name).toBe('Engadin')
    expect(trip?.duration_days).toBe(10)

    const travelers = tripStore.getTravelers(tripId)
    expect(travelers.map((t) => t.name).sort()).toEqual(['Andy', 'Ronja'])

    const items = tripStore.getItems(tripId)
    expect(items).toHaveLength(3)
    const andy = travelers.find((t) => t.name === 'Andy')!
    const perPerson = items.find((i) => i.assigned_traveler_id === andy.id)
    expect(perPerson?.quantity).toBe(5)
    expect(items.find((i) => i.name === 'Zelt')?.assigned_traveler_id).toBeNull()

    // Let the background drains finish so they don't leak into the next test.
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(4))
  })

  it('drains the master partition before the trip partition (FK + membership)', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    mockPush()
    mockPull()
    mockPush()
    mockPull()

    const tripId = orch.createTripFromWizard({
      name: 'Engadin',
      startDate: null,
      endDate: '2026-08-10',
      attributes: null,
      travelers: [{ name: 'Andy', profile: 'adult' }],
      items: [generated()],
    })
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(4))

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls[0]).toContain('/api/v1/sync/master')
    expect(urls[2]).toContain(`/api/v1/sync/trips/${tripId}`)
  })

  it('computes no duration without a start date (FR-2.1a)', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()
    mockPush()
    mockPull()
    mockPush()
    mockPull()

    const tripId = orch.createTripFromWizard({
      name: 'Offen',
      startDate: null,
      endDate: '2026-08-10',
      attributes: null,
      travelers: [],
      items: [],
    })

    expect(tripStore.getTrip(tripId)?.duration_days).toBeNull()
  })
})
