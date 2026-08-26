/**
 * M3 wizard write path: trip creation cascade (trips → master partition,
 * travelers/trip_items → trip partition) with per-traveler assignment
 * and FR-5.5 skipped state for quantity-zero items.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useMutations } from '../useMutations'
import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { HLCGenerator } from '@/sync/hlc'
import { useTripStore } from '@/stores/tripStore'
import type { GeneratedItem } from '@/domain/instantiate'
import type { PullResponse, PushResponse } from '@/api/types'
import { installHarness } from '@/__tests__/harness'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;({ fetch: fetchMock } = installHarness())
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
    tasks: [],
    ...overrides,
  }
}

describe('useMutations wizard additions', () => {
  const mutations = useMutations(new HLCGenerator(() => Date.now(), 'aabbccdd'))

  it('addTraveler builds a travelers insert on the trip partition', () => {
    const { mutation } = mutations.addTraveler('trip-1', 'Ronja')

    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('travelers')
    expect(mutation.fields).toMatchObject({
      trip_id: 'trip-1',
      name: 'Ronja',
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
      year: 2026,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      attributes: { season: 'summer' },
      travelers: [{ name: 'Andy' }, { name: 'Ronja' }],
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
      year: 2026,
      startDate: null,
      endDate: '2026-08-10',
      attributes: null,
      travelers: [{ name: 'Andy' }],
      items: [generated()],
    })
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(4))

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls[0]).toContain('/api/v1/master/sync')
    expect(urls[2]).toContain(`/api/v1/trips/${tripId}/sync`)
  })

  it('accepts companion rows without a source template (FR-20.2)', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()
    mockPush()
    mockPull()
    mockPush()
    mockPull()

    const tripId = orch.createTripFromWizard({
      name: 'Fototour',
      year: 2026,
      startDate: null,
      endDate: '2026-08-10',
      attributes: null,
      travelers: [],
      items: [
        generated({ source_item_id: 'camera', name: 'Kamera', quantity: 1 }),
        {
          ...generated({ source_item_id: 'battery', name: 'Ersatzakku', quantity: 2 }),
          source_template_id: null,
        },
      ],
    })

    const battery = tripStore.getItems(tripId).find((i) => i.name === 'Ersatzakku')
    expect(battery?.source_template_id).toBeNull()
    expect(battery?.quantity).toBe(2)
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(4))
  })

  it('materialises FR-27.7 template tasks as open prep todos on the generated row', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()
    mockPush()
    mockPull()
    mockPush()
    mockPull()

    const tripId = orch.createTripFromWizard({
      name: 'Fototour',
      year: 2026,
      startDate: null,
      endDate: null,
      attributes: null,
      travelers: [],
      items: [
        generated({ source_item_id: 'charger', name: 'Ladegerät', tasks: ['Akkus laden'] }),
        generated({ source_item_id: 'tent', name: 'Zelt' }),
      ],
    })

    const charger = tripStore.getItems(tripId).find((i) => i.name === 'Ladegerät')!
    const tent = tripStore.getItems(tripId).find((i) => i.name === 'Zelt')!
    const todos = tripStore.getTodos(tripId)

    expect(todos).toHaveLength(1)
    expect(todos[0]).toMatchObject({
      trip_item_id: charger.id,
      body: 'Akkus laden',
      task_state: 'open',
    })
    // The row without tasks stays clean — a todo on it would block it from
    // ever counting as done (FR-7.3).
    expect(tripStore.getItemTodos(tripId, tent.id)).toHaveLength(0)

    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(4))
  })

  it('pushes a prep todo after the row it hangs off (FK ordering)', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()
    mockPush()
    mockPull()
    mockPush()
    mockPull()

    const tripId = orch.createTripFromWizard({
      name: 'Fototour',
      year: 2026,
      startDate: null,
      endDate: null,
      attributes: null,
      travelers: [],
      items: [generated({ source_item_id: 'charger', name: 'Ladegerät', tasks: ['Akkus laden'] })],
    })
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(4))

    const charger = tripStore.getItems(tripId).find((i) => i.name === 'Ladegerät')!
    const tripPush = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes(`/trips/${tripId}/sync`),
    )
    const mutations = JSON.parse(String(tripPush![1].body)).mutations as {
      table: string
      id: string
      fields?: Record<string, unknown>
    }[]

    const rowIndex = mutations.findIndex((m) => m.table === 'trip_items' && m.id === charger.id)
    const todoIndex = mutations.findIndex((m) => m.table === 'comments')
    expect(rowIndex).toBeGreaterThanOrEqual(0)
    // The comments row carries trip_item_id as a foreign key: pushed first, the
    // server rejects it.
    expect(todoIndex).toBeGreaterThan(rowIndex)
    expect(mutations[todoIndex]!.fields).toMatchObject({
      trip_item_id: charger.id,
      is_task: 1,
      task_state: 'open',
    })
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
      year: 2026,
      startDate: null,
      endDate: '2026-08-10',
      attributes: null,
      travelers: [],
      items: [],
    })

    expect(tripStore.getTrip(tripId)?.duration_days).toBeNull()
  })
})
