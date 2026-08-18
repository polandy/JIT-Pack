/**
 * FR-27.4 write path: a *planning* trip follows the templates it was
 * registered against, and every change it takes over is logged for M2's
 * chip. The diff itself is specified in `domain/__tests__/refresh.spec.ts`;
 * what is asserted here is that the orchestrator turns a plan into the
 * right rows, in the right partitions, and stays quiet when nothing moved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import { TABLE } from '@/types/tables'
import type { PullChange } from '@/api/types'

const TRIP_ID = 'trip-1'
const GROUP_ID = 'grp-1'
const ITEM_ID = 'item-kamera'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal(
    'WebSocket',
    vi.fn(() => ({ send: vi.fn(), close: vi.fn(), readyState: 1 })),
  )
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function change(table: string, id: string, row: Record<string, unknown>): PullChange {
  return { seq: 0, table, id, deleted: false, row }
}

/**
 * A Local Mode orchestrator: no network, no outbox, and every write lands
 * in the stores synchronously — which is what makes the assertions below
 * about *rows* rather than about queued envelopes.
 *
 * `connect()` is awaited by every caller, because it is what marks the
 * device hydrated: the refresh refuses to run before that, and rightly so.
 */
async function localOrchestrator() {
  const orch = useSyncOrchestrator({
    baseUrl: 'http://localhost',
    getToken: () => null,
    local: {
      save: () => Promise.resolve(),
      load: () => Promise.resolve([]),
      requestDurability: () => Promise.resolve(true),
    } as never,
  })
  await orch.connect()
  return orch
}

/** One planning trip that follows one group carrying one position. */
function seedWorld(status = 'planning') {
  useTripStore().applyChanges([
    change(TABLE.trips, TRIP_ID, { name: 'Samedan', year: 2026, status }),
    change(TABLE.tripTemplateSources, 'src-1', { trip_id: TRIP_ID, template_id: GROUP_ID }),
  ])
  useMasterStore().applyChanges([
    change(TABLE.templates, GROUP_ID, { name: 'Makro Fotografie', kind: 'group', owner_id: 'u1' }),
    change(TABLE.items, ITEM_ID, { name: 'Kamera', weight_grams: 780, value_cents: null }),
    change(TABLE.templateItems, 'pos-1', {
      template_id: GROUP_ID,
      item_id: ITEM_ID,
      quantity: 1,
      assignment: 'trip_global',
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
    }),
  ])
}

describe('refreshPlanningTrip (FR-27.4)', () => {
  it('adds the group’s position to the trip and logs it with the group name', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()

    orch.refreshPlanningTrip(TRIP_ID)

    const items = tripStore.getItems(TRIP_ID)
    expect(items.map((i) => i.name)).toEqual(['Kamera'])
    expect(items[0]?.weight_grams).toBe(780)

    const log = tripStore.getAppliedChanges(TRIP_ID)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      kind: 'added',
      item_name: 'Kamera',
      source_template_name: 'Makro Fotografie',
    })
  })

  it('records what it produced, so a second run adds nothing', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()

    orch.refreshPlanningTrip(TRIP_ID)
    const plan = orch.refreshPlanningTrip(TRIP_ID)

    expect(plan?.add).toEqual([])
    expect(tripStore.getItems(TRIP_ID)).toHaveLength(1)
    expect(tripStore.getAppliedChanges(TRIP_ID)).toHaveLength(1)
    expect(tripStore.getGeneratedPositions(TRIP_ID)).toHaveLength(1)
  })

  it('carries a later quantity change onto the untouched row and logs from → to', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    orch.refreshPlanningTrip(TRIP_ID)

    // The group is edited — on this device or, just as well, on another one
    // whose change arrived with the master pull.
    useMasterStore().applyChanges([
      change(TABLE.templateItems, 'pos-1', {
        template_id: GROUP_ID,
        item_id: ITEM_ID,
        quantity: 3,
        assignment: 'trip_global',
        dedup: 'max',
        default_mode: 'pack',
        late_packer: 0,
      }),
    ])
    orch.refreshPlanningTrip(TRIP_ID)

    expect(tripStore.getItems(TRIP_ID)[0]?.quantity).toBe(3)
    expect(tripStore.getAppliedChanges(TRIP_ID)[0]).toMatchObject({
      kind: 'changed',
      detail: { field: 'quantity', from: 1, to: 3 },
    })
  })

  it('leaves an active trip alone — the freeze is absolute', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld('active')

    orch.refreshPlanningTrip(TRIP_ID)

    expect(tripStore.getItems(TRIP_ID)).toEqual([])
    expect(tripStore.getAppliedChanges(TRIP_ID)).toEqual([])
  })

  it('materialises an FR-27.7 task as a preparation todo on the row it generated', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    useMasterStore().applyChanges([
      change(TABLE.templateItemTasks, 'task-1', {
        template_item_id: 'pos-1',
        task: 'Akkus laden',
      }),
    ])

    orch.refreshPlanningTrip(TRIP_ID)

    const item = tripStore.getItems(TRIP_ID)[0]!
    expect(tripStore.getItemTodos(TRIP_ID, item.id).map((t) => t.body)).toEqual(['Akkus laden'])
  })

  it('refreshes every loaded planning trip, and only those', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    useTripStore().applyChanges([
      change(TABLE.trips, 'trip-2', { name: 'Läuft schon', year: 2026, status: 'active' }),
      change(TABLE.tripTemplateSources, 'src-2', { trip_id: 'trip-2', template_id: GROUP_ID }),
    ])

    orch.refreshLoadedPlanningTrips()

    expect(tripStore.getItems(TRIP_ID)).toHaveLength(1)
    expect(tripStore.getItems('trip-2')).toEqual([])
  })
})

describe('the refresh refuses to run on rows it cannot see (FR-27.4)', () => {
  it('does nothing before the device has hydrated — "not loaded" is not "empty"', async () => {
    // The world is registered and the group carries a position, but this
    // orchestrator never connected, so its rows have not arrived. Reading
    // that as an empty trip would re-add every position the trip already
    // has — duplicating the list the feature exists to keep right.
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      local: { save: () => Promise.resolve(), load: () => Promise.resolve([]) } as never,
    })
    const tripStore = useTripStore()
    seedWorld()

    expect(orch.refreshPlanningTrip(TRIP_ID)).toBeNull()
    expect(tripStore.getItems(TRIP_ID)).toEqual([])
  })

  it('skips a Server Mode trip whose partition was never pulled', async () => {
    // No `local`, and no drainTrip has succeeded for this trip: in Server
    // Mode a trip's rows arrive only when it is opened, and M2 shows trips
    // from the *master* partition long before that.
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()
    seedWorld()

    orch.refreshLoadedPlanningTrips()

    expect(tripStore.getItems(TRIP_ID)).toEqual([])
    expect(tripStore.getAppliedChanges(TRIP_ID)).toEqual([])
  })
})

describe('createTripFromWizard registers what the trip follows (FR-27.4)', () => {
  it('writes one trip_template_sources row per picked template', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    const masterStore = useMasterStore()
    masterStore.applyChange(
      change(TABLE.templates, GROUP_ID, { name: 'Makro', kind: 'group', owner_id: 'u1' }),
    )

    const tripId = orch.createTripFromWizard({
      name: 'Engadin',
      year: 2026,
      startDate: null,
      endDate: null,
      attributes: null,
      travelers: [{ name: 'Andy' }],
      items: [],
      sourceTemplateIds: [GROUP_ID],
    })

    expect(tripStore.getTemplateSources(tripId).map((s) => s.template_id)).toEqual([GROUP_ID])
  })
})
