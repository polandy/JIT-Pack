// @vitest-environment jsdom
/**
 * FR-9.5 — the forgotten radar as M4 shows it: when the card is there, when
 * it waits for the reference trip's rows, and what „Auf die Liste" and
 * „Ausblenden" write. Which trip and which entries is `forgottenRadar.spec.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import { installHarness } from '@/__tests__/harness'
import { isRadarHidden } from '@/local/radarHidden'
import type { Trip, TripItem } from '@/types/domain'

import type { PackingCore } from '../usePackingCore'
import { usePackingHead } from '../usePackingHead'

vi.mock('@/composables/shared/toast', () => ({ presentToast: vi.fn() }))

function trip(id: string, over: Partial<Trip> = {}): Trip {
  return {
    id,
    name: id,
    status: 'archived',
    year: 2025,
    start_date: null,
    end_date: null,
    duration_days: null,
    series_id: 'samedan',
    attributes: null,
    packing_closed_at: null,
    imported: false,
    ...over,
  }
}

const AKKU = {
  id: 'r-akku',
  trip_id: 'ref',
  source_item_id: 'i-akku',
  name: 'Ersatzakku',
  flag_missing: true,
  state: 'open',
} as TripItem

/** A core over one planning trip and its archived predecessor in the series. */
function setup(over: { status?: Trip['status']; loaded?: boolean } = {}) {
  const planning = trip('new', { status: over.status ?? 'planning', year: 2026 })
  const reference = trip('ref', { name: 'Samedan 2025' })
  const rows = ref<TripItem[]>([])
  const loaded = ref(over.loaded ?? true)
  const ensureTripData = vi.fn(async () => {})
  const setTravelerAssignment = vi.fn(() => ({ id: 'added', companions: [] as string[] }))
  const core = {
    tripId: 'new',
    trip: computed(() => planning),
    allItems: computed(() => rows.value),
    active: computed(() => false),
    tripStore: {
      tripList: [planning, reference],
      getTemplateSources: () => [],
      getItems: (id: string) => (id === 'ref' ? [AKKU] : rows.value),
      getComments: () => [],
    },
    masterStore: {
      templateList: [],
      itemList: [],
      getTemplateItems: () => [],
      getSeries: () => ({ id: 'samedan', name: 'Samedan' }),
      getTemplate: () => undefined,
      getItem: (id: string) =>
        id === 'i-akku'
          ? { id, name: 'Ersatzakku', weight_grams: 80, value_cents: null }
          : undefined,
      categoryOf: () => 'Elektronik',
    },
    orchestrator: {
      identity: {},
      ensureTripData,
      tripDataLoaded: () => loaded.value,
      packing: { setTravelerAssignment },
    },
  } as unknown as PackingCore
  return { head: usePackingHead(core), rows, loaded, ensureTripData, setTravelerAssignment }
}

describe('usePackingHead — the forgotten radar (FR-9.5)', () => {
  beforeEach(() => {
    installHarness()
  })

  it('names the reference trip, its series and its missing entry on a planning trip', () => {
    const { head } = setup()
    expect(head.radar.value).toMatchObject({
      tripName: 'Samedan 2025',
      reason: 'same series “Samedan”',
      pending: false,
      entries: [{ key: 'i-akku', name: 'Ersatzakku', why: 'Was not on the list', comments: [] }],
    })
  })

  it('is absent on an active trip — the time to act on the list is over', () => {
    expect(setup({ status: 'active' }).head.radar.value).toBeNull()
  })

  it('asks for the reference trip’s rows, and holds a pending line until they are here', () => {
    const { head, loaded, ensureTripData } = setup({ loaded: false })
    expect(ensureTripData).toHaveBeenCalledWith('ref')
    expect(head.radar.value).toMatchObject({ pending: true, entries: [] })
    loaded.value = true
    expect(head.radar.value?.pending).toBe(false)
  })

  it('adds one trip-global row from the inventory item, and the card leaves once it is there', () => {
    const { head, rows, setTravelerAssignment } = setup()
    head.onRadarAdd('i-akku')
    expect(setTravelerAssignment).toHaveBeenCalledWith(
      'new',
      'Ersatzakku',
      { sourceItemId: 'i-akku', weightGrams: 80, valueCents: null, categoryName: 'Elektronik' },
      false,
      [],
      [],
    )
    rows.value = [{ ...AKKU, id: 'added', trip_id: 'new', flag_missing: false }]
    expect(head.radar.value).toBeNull()
  })

  it('hides the card for this trip on this device', () => {
    const { head } = setup()
    head.onRadarHide()
    expect(head.radar.value).toBeNull()
    expect(isRadarHidden('new')).toBe(true)
  })
})
