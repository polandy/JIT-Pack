/**
 * FR-27.4 write path: a trip is *offered* what the groups it follows would
 * change, and only an answer moves anything. The diff itself is specified in
 * `domain/__tests__/refresh.spec.ts`; what is asserted here is that deriving
 * writes nothing, that accepting turns a plan into the right rows in the
 * right partitions, and that declining advances the ledger and nothing else.
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
const TODAY = '2026-01-15'

async function localOrchestrator(today = TODAY) {
  const orch = useSyncOrchestrator({
    baseUrl: 'http://localhost',
    getToken: () => null,
    today: () => today,
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
function seedWorld(status = 'planning', endDate: string | null = '2026-02-08') {
  useTripStore().applyChanges([
    change(TABLE.trips, TRIP_ID, { name: 'Samedan', year: 2026, status, end_date: endDate }),
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

/** The group edit the trip is then asked about. */
function editGroupQuantity(quantity: number) {
  useMasterStore().applyChanges([
    change(TABLE.templateItems, 'pos-1', {
      template_id: GROUP_ID,
      item_id: ITEM_ID,
      quantity,
      assignment: 'trip_global',
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
    }),
  ])
}

describe('proposeTripRefresh — the question (FR-27.4)', () => {
  it('offers the group’s position without putting it on the trip', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()

    const plan = orch.proposeTripRefresh(TRIP_ID)

    expect(plan?.add.map((a) => a.generated.name)).toEqual(['Kamera'])
    expect(orch.refreshProposals.value[TRIP_ID]).toBe(plan)
    // Nothing moved: not the list, not the log, not the ledger. Writing any
    // of the three here would answer the question on the user's behalf.
    expect(tripStore.getItems(TRIP_ID)).toEqual([])
    expect(tripStore.getAppliedChanges(TRIP_ID)).toEqual([])
    expect(tripStore.getGeneratedPositions(TRIP_ID)).toEqual([])
  })

  it('asks nothing about a hand-added row it merely adopts, and records the adoption', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    orch.quickAddItem(TRIP_ID, 'Kamera', { sourceItemId: ITEM_ID }, false)

    const plan = orch.proposeTripRefresh(TRIP_ID)

    expect(plan?.add).toEqual([])
    expect(orch.refreshProposals.value[TRIP_ID]).toBeUndefined()
    // The bookkeeping half runs immediately: leaving it unwritten would
    // re-derive the same adoption on every open, forever.
    expect(tripStore.getGeneratedPositions(TRIP_ID)).toHaveLength(1)
    expect(tripStore.getAppliedChanges(TRIP_ID)).toEqual([])
  })

  it('still asks a running trip — departure does not freeze it', async () => {
    // Owner rule 2026-08-18: only the past is frozen.
    const orch = await localOrchestrator()
    seedWorld('active')

    expect(orch.proposeTripRefresh(TRIP_ID)?.add).toHaveLength(1)
  })

  it('asks an archived trip nothing — the freeze is the past', async () => {
    const orch = await localOrchestrator()
    seedWorld('archived')

    expect(orch.proposeTripRefresh(TRIP_ID)?.add).toEqual([])
    expect(orch.refreshProposals.value[TRIP_ID]).toBeUndefined()
  })

  it('asks a trip whose end date has passed nothing, open or not', async () => {
    const orch = await localOrchestrator('2026-02-09')
    seedWorld('active')

    expect(orch.proposeTripRefresh(TRIP_ID)?.add).toEqual([])
    expect(orch.refreshProposals.value[TRIP_ID]).toBeUndefined()
  })

  it('sweeps every trip that still follows its groups, and skips the past ones', async () => {
    const orch = await localOrchestrator()
    seedWorld()
    useTripStore().applyChanges([
      change(TABLE.trips, 'trip-2', {
        name: 'Läuft schon',
        year: 2026,
        status: 'active',
        end_date: '2026-03-01',
      }),
      change(TABLE.tripTemplateSources, 'src-2', { trip_id: 'trip-2', template_id: GROUP_ID }),
      change(TABLE.trips, 'trip-3', {
        name: 'Letztes Jahr',
        year: 2025,
        status: 'archived',
        end_date: '2025-08-01',
      }),
      change(TABLE.tripTemplateSources, 'src-3', { trip_id: 'trip-3', template_id: GROUP_ID }),
    ])

    orch.proposeRefreshForLoadedTrips()

    expect(Object.keys(orch.refreshProposals.value).sort()).toEqual([TRIP_ID, 'trip-2'])
  })
})

describe('acceptTripRefresh — the answer yes (FR-27.4)', () => {
  it('adds the group’s position to the trip and logs it with the group name', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    orch.proposeTripRefresh(TRIP_ID)

    orch.acceptTripRefresh(TRIP_ID)

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
    // The question is answered, so it must stop being asked.
    expect(orch.refreshProposals.value[TRIP_ID]).toBeUndefined()
  })

  it('records what it produced, so nothing is offered a second time', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()

    orch.acceptTripRefresh(TRIP_ID)
    const plan = orch.proposeTripRefresh(TRIP_ID)

    expect(plan?.add).toEqual([])
    expect(tripStore.getItems(TRIP_ID)).toHaveLength(1)
    expect(tripStore.getAppliedChanges(TRIP_ID)).toHaveLength(1)
    expect(tripStore.getGeneratedPositions(TRIP_ID)).toHaveLength(1)
  })

  it('carries a later quantity change onto the untouched row and logs from → to', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    orch.acceptTripRefresh(TRIP_ID)

    // The group is edited — on this device or, just as well, on another one
    // whose change arrived with the master pull.
    editGroupQuantity(3)
    orch.acceptTripRefresh(TRIP_ID)

    expect(tripStore.getItems(TRIP_ID)[0]?.quantity).toBe(3)
    expect(tripStore.getAppliedChanges(TRIP_ID)[0]).toMatchObject({
      kind: 'changed',
      detail: { field: 'quantity', from: 1, to: 3 },
    })
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

    orch.acceptTripRefresh(TRIP_ID)

    const item = tripStore.getItems(TRIP_ID)[0]!
    expect(tripStore.getItemTodos(TRIP_ID, item.id).map((t) => t.body)).toEqual(['Akkus laden'])
  })
})

describe('declineTripRefresh — the answer no (FR-27.4)', () => {
  it('leaves the row as it is, logs nothing, and stops asking', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    orch.acceptTripRefresh(TRIP_ID)
    editGroupQuantity(3)
    expect(orch.proposeTripRefresh(TRIP_ID)?.update).toHaveLength(1)

    orch.declineTripRefresh(TRIP_ID)

    expect(tripStore.getItems(TRIP_ID)[0]?.quantity).toBe(1)
    // M2's log is the record of what the trip *took over*; a refusal took
    // nothing over, so the only entry there is still the original add.
    expect(tripStore.getAppliedChanges(TRIP_ID)).toHaveLength(1)
    expect(orch.refreshProposals.value[TRIP_ID]).toBeUndefined()
    // The snapshot advanced to the version that was refused — that gap is
    // what keeps the row the user's from here on.
    expect(tripStore.getGeneratedPositions(TRIP_ID)[0]?.quantity).toBe(3)
    expect(orch.proposeTripRefresh(TRIP_ID)?.update).toEqual([])
  })

  it('does not ask again about a refused addition', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    orch.proposeTripRefresh(TRIP_ID)

    orch.declineTripRefresh(TRIP_ID)

    expect(tripStore.getItems(TRIP_ID)).toEqual([])
    expect(orch.proposeTripRefresh(TRIP_ID)?.add).toEqual([])
    expect(orch.refreshProposals.value[TRIP_ID]).toBeUndefined()
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

    expect(orch.proposeTripRefresh(TRIP_ID)).toBeNull()
    expect(tripStore.getItems(TRIP_ID)).toEqual([])
  })

  it('skips a Server Mode trip whose partition was never pulled', async () => {
    // No `local`, and no drainTrip has succeeded for this trip: in Server
    // Mode a trip's rows arrive only when it is opened, and M2 shows trips
    // from the *master* partition long before that.
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()
    seedWorld()

    orch.proposeRefreshForLoadedTrips()

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

describe('a master pull asks the trips it just changed something for (FR-27.4)', () => {
  /**
   * Server Mode: one pull per drain. No push is mocked — the outbox skips it
   * with an empty queue, and mocking one would consume the pull's response.
   */
  function mockDrain(changes: PullChange[]) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ changes, next_cursor: 1, has_more: false }), { status: 200 }),
    )
  }

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('proposes without being asked when a group edit arrives over sync', async () => {
    // The device is *not* on the screen that would ask: M2 shows trips from
    // the master partition, and the edit was made on somebody else's phone.
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      today: () => TODAY,
    })
    const tripStore = useTripStore()

    // The trip's own partition arrives first — that is what makes it *loaded*,
    // and an unloaded partition is deliberately never guessed at.
    mockDrain([
      change(TABLE.trips, TRIP_ID, {
        name: 'Samedan',
        year: 2026,
        status: 'planning',
        end_date: '2026-02-08',
      }),
      change(TABLE.tripTemplateSources, 'src-1', { trip_id: TRIP_ID, template_id: GROUP_ID }),
    ])
    await orch.drainTrip(TRIP_ID)

    // Then the master pull brings the group and its position.
    mockDrain([
      change(TABLE.templates, GROUP_ID, {
        name: 'Makro Fotografie',
        kind: 'group',
        owner_id: 'u1',
      }),
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
    await orch.drainMaster()

    expect(orch.refreshProposals.value[TRIP_ID]?.add.map((a) => a.generated.name)).toEqual([
      'Kamera',
    ])
    // Still only offered — arriving over the wire is not an answer either.
    expect(tripStore.getItems(TRIP_ID)).toEqual([])
  })
})
