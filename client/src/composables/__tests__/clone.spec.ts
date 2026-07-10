/**
 * cloneTrip cascade (FR-12.1/12.2): master-partition trip first (same
 * series, copied attributes), then travelers, containers (pairing as a
 * second pass — a forward pair reference would hit the FK), then items
 * with remapped links and fresh pack state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi
    .fn()
    .mockResolvedValue(
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

function seedSource(store: ReturnType<typeof useTripStore>) {
  store.applyChange({
    seq: 0,
    table: 'trips',
    id: 'src',
    deleted: false,
    row: {
      name: 'Engadin 2025',
      status: 'archived',
      start_date: '2025-08-01',
      end_date: '2025-08-07',
      series_id: 'ser-1',
      attributes: '{"season":"summer"}',
    },
  })
  store.applyChange({
    seq: 0,
    table: 'travelers',
    id: 'tr1',
    deleted: false,
    row: { trip_id: 'src', name: 'Andy', profile: 'adult' },
  })
  store.applyChange({
    seq: 0,
    table: 'containers',
    id: 'c1',
    deleted: false,
    row: {
      trip_id: 'src',
      name: 'Radtasche links',
      carrier_traveler_id: 'tr1',
      max_weight_grams: 9000,
      paired_container_id: 'c2',
    },
  })
  store.applyChange({
    seq: 0,
    table: 'containers',
    id: 'c2',
    deleted: false,
    row: { trip_id: 'src', name: 'Radtasche rechts', paired_container_id: 'c1' },
  })
  store.applyChange({
    seq: 0,
    table: 'trip_items',
    id: 'a',
    deleted: false,
    row: {
      trip_id: 'src',
      name: 'Zelt',
      quantity: 1,
      packed_count: 1,
      state: 'packed',
      mode: 'pack',
      assigned_traveler_id: 'tr1',
      container_id: 'c2',
      packer_user_id: 'user-9',
      flag_unused: 1,
    },
  })
  store.applyChange({
    seq: 0,
    table: 'trip_items',
    id: 'b',
    deleted: false,
    row: {
      trip_id: 'src',
      name: 'Schneeschuhe',
      quantity: 0,
      packed_count: 0,
      state: 'skipped',
      mode: 'pack',
    },
  })
}

describe('cloneTrip (FR-12)', () => {
  it('clones the curated list with remapped links and fresh state', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    seedSource(store)

    const tripId = orch.cloneTrip('src', {
      name: 'Engadin 2026',
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      options: { travelerAssignments: true, packerDelegations: true, containerAssignments: true },
    })!

    const trip = store.getTrip(tripId)!
    expect(trip).toMatchObject({
      name: 'Engadin 2026',
      status: 'planning',
      series_id: 'ser-1',
      attributes: { season: 'summer' },
    })

    const travelers = store.getTravelers(tripId)
    expect(travelers.map((t) => t.name)).toEqual(['Andy'])

    const containers = store.getContainers(tripId)
    expect(containers).toHaveLength(2)
    const left = containers.find((c) => c.name === 'Radtasche links')!
    const right = containers.find((c) => c.name === 'Radtasche rechts')!
    expect(left.carrier_traveler_id).toBe(travelers[0]!.id)
    expect(left.paired_container_id).toBe(right.id)
    expect(right.paired_container_id).toBe(left.id)

    const items = store.getItems(tripId)
    const zelt = items.find((i) => i.name === 'Zelt')!
    expect(zelt).toMatchObject({
      state: 'open',
      packed_count: 0,
      flag_unused: false,
      assigned_traveler_id: travelers[0]!.id,
      container_id: right.id,
      packer_user_id: 'user-9',
    })
    expect(items.find((i) => i.name === 'Schneeschuhe')?.state).toBe('skipped')
  })

  it('drops links and containers when the carry-over options are off', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    seedSource(store)

    const tripId = orch.cloneTrip('src', {
      name: 'Engadin 2026',
      startDate: null,
      endDate: '2026-08-10',
      options: {
        travelerAssignments: false,
        packerDelegations: false,
        containerAssignments: false,
      },
    })!

    expect(store.getContainers(tripId)).toHaveLength(0)
    const zelt = store.getItems(tripId).find((i) => i.name === 'Zelt')!
    expect(zelt.assigned_traveler_id).toBeNull()
    expect(zelt.container_id).toBeNull()
    expect(zelt.packer_user_id).toBeNull()
  })
})
