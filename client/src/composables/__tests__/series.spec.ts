/**
 * M16 series layer (FR-13.1/13.2): trip_series and destination_* sync
 * through the master partition into the master store; orchestrator
 * actions cover series CRUD, trip attach/detach, and the destination
 * profile with its checklist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
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

function newOrch() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

describe('master store — series tables from pull changes', () => {
  it('applies trip_series rows including parsed default attributes', () => {
    const master = useMasterStore()
    master.applyChange({
      seq: 1,
      table: 'trip_series',
      id: 'ser-1',
      deleted: false,
      row: { owner_id: 'me', name: 'Samedan Sommer', default_attributes: '{"season":"summer"}' },
    })

    expect(master.seriesList).toHaveLength(1)
    expect(master.getSeries('ser-1')).toMatchObject({
      name: 'Samedan Sommer',
      default_attributes: { season: 'summer' },
    })
  })

  it('applies destination profile and checklist items, keyed by series', () => {
    const master = useMasterStore()
    master.applyChange({
      seq: 1,
      table: 'destination_profiles',
      id: 'prof-1',
      deleted: false,
      row: { series_id: 'ser-1', notes: 'Waschmaschine vorhanden' },
    })
    master.applyChange({
      seq: 2,
      table: 'destination_checklist_items',
      id: 'chk-1',
      deleted: false,
      row: { profile_id: 'prof-1', label: 'Milch', mode: 'buy_local' },
    })

    expect(master.getDestinationProfile('ser-1')?.notes).toBe('Waschmaschine vorhanden')
    expect(master.getChecklistItems('prof-1')).toHaveLength(1)

    master.applyChange({
      seq: 3,
      table: 'destination_checklist_items',
      id: 'chk-1',
      deleted: true,
      row: null,
    })
    expect(master.getChecklistItems('prof-1')).toHaveLength(0)

    master.applyChange({
      seq: 4,
      table: 'destination_profiles',
      id: 'prof-1',
      deleted: true,
      row: null,
    })
    expect(master.getDestinationProfile('ser-1')).toBeUndefined()
  })
})

describe('series actions (FR-13.1)', () => {
  it('createSeries stores the series and pushes to the master partition', async () => {
    const orch = newOrch()
    const master = useMasterStore()

    const id = orch.createSeries('Samedan Winter', { season: 'winter' })

    expect(master.getSeries(id)).toMatchObject({
      name: 'Samedan Winter',
      default_attributes: { season: 'winter' },
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/sync/master')
  })

  it('updateSeries patches fields and keeps the rest', () => {
    const orch = newOrch()
    const master = useMasterStore()
    const id = orch.createSeries('Samedan', { season: 'summer' })

    orch.updateSeries(master.getSeries(id)!, { name: 'Samedan Sommer' })

    expect(master.getSeries(id)).toMatchObject({
      name: 'Samedan Sommer',
      default_attributes: { season: 'summer' },
    })
  })

  it('setTripSeries attaches and detaches a trip', () => {
    const orch = newOrch()
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trips',
      id: 't1',
      deleted: false,
      row: { name: 'Engadin', status: 'planning', end_date: '2026-08-10' },
    })

    orch.setTripSeries('t1', 'ser-1')
    expect(trips.getTrip('t1')?.series_id).toBe('ser-1')

    orch.setTripSeries('t1', null)
    expect(trips.getTrip('t1')?.series_id).toBeNull()
  })
})

describe('wizard integration (FR-13.1/13.3)', () => {
  it('creates a new series inline before the trip and links it', () => {
    const orch = newOrch()
    const master = useMasterStore()
    const trips = useTripStore()

    const tripId = orch.createTripFromWizard({
      name: 'Engadin 2026',
      startDate: null,
      endDate: '2026-08-10',
      attributes: { season: 'summer' },
      travelers: [],
      items: [],
      newSeriesName: 'Samedan Sommer',
    })

    const trip = trips.getTrip(tripId)!
    expect(trip.series_id).not.toBeNull()
    const series = master.getSeries(trip.series_id!)
    expect(series).toMatchObject({
      name: 'Samedan Sommer',
      default_attributes: { season: 'summer' },
    })
  })

  it('attaches an existing series and adds the offered checklist items (FR-13.3)', () => {
    const orch = newOrch()
    const trips = useTripStore()
    const seriesId = orch.createSeries('Samedan')

    const tripId = orch.createTripFromWizard({
      name: 'Engadin 2026',
      startDate: null,
      endDate: '2026-08-10',
      attributes: null,
      travelers: [],
      items: [],
      seriesId,
      checklistItems: [
        { label: 'Milch', mode: 'buy_local' },
        { label: 'Sonnencreme', mode: 'buy_before' },
      ],
    })

    expect(trips.getTrip(tripId)?.series_id).toBe(seriesId)
    const items = trips.getItems(tripId)
    expect(items).toHaveLength(2)
    expect(items.find((i) => i.name === 'Milch')?.mode).toBe('buy_local')
    expect(items.find((i) => i.name === 'Sonnencreme')?.mode).toBe('buy_before')
  })
})

describe('destination profile actions (FR-13.2/13.3)', () => {
  it('ensureDestinationProfile creates once and then reuses the profile', () => {
    const orch = newOrch()
    const master = useMasterStore()
    const seriesId = orch.createSeries('Samedan')

    const profileId = orch.ensureDestinationProfile(seriesId)
    expect(master.getDestinationProfile(seriesId)?.id).toBe(profileId)
    expect(orch.ensureDestinationProfile(seriesId)).toBe(profileId)
  })

  it('updateDestinationProfile saves the notes', () => {
    const orch = newOrch()
    const master = useMasterStore()
    const seriesId = orch.createSeries('Samedan')
    const profileId = orch.ensureDestinationProfile(seriesId)

    orch.updateDestinationProfile(master.getDestinationProfile(seriesId)!, {
      notes: 'Waschmaschine vorhanden',
    })

    expect(master.getDestinationProfile(seriesId)?.notes).toBe('Waschmaschine vorhanden')
    expect(master.getDestinationProfile(seriesId)?.id).toBe(profileId)
  })

  it('checklist lifecycle: add, update, delete (FR-13.3)', () => {
    const orch = newOrch()
    const master = useMasterStore()
    const seriesId = orch.createSeries('Samedan')
    const profileId = orch.ensureDestinationProfile(seriesId)

    const itemId = orch.addChecklistItem(profileId, 'Milch', 'buy_local')
    expect(master.getChecklistItems(profileId)).toHaveLength(1)

    orch.updateChecklistItem(master.getChecklistItems(profileId)[0]!, { label: 'Hafermilch' })
    expect(master.getChecklistItems(profileId)[0]).toMatchObject({
      label: 'Hafermilch',
      mode: 'buy_local',
    })

    orch.deleteChecklistItem(itemId)
    expect(master.getChecklistItems(profileId)).toHaveLength(0)
  })
})
