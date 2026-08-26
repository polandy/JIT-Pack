/**
 * FR-27.10 write path: a whole group added to a trip that already exists.
 * The resolution itself is specified in `domain/__tests__/groupAdd.spec.ts`;
 * what is asserted here is what actually lands — the rows and their
 * provenance, the FR-27.7 todos, the FR-27.4 registration, and the flag that
 * is deliberately *not* set.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import { TABLE } from '@/types/tables'
import type { PullChange } from '@/api/types'
import { installHarness } from '@/__tests__/harness'

const TRIP_ID = 'trip-1'
const GROUP_ID = 'grp-1'
const ITEM_ID = 'item-kamera'
const TODAY = '2026-01-15'

beforeEach(() => {
  installHarness()
})

function change(table: string, id: string, row: Record<string, unknown>): PullChange {
  return { seq: 0, table, id, deleted: false, row }
}

/** Local Mode: no network, no outbox, every write lands in the stores. */
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

/** A trip with one traveler, and a group carrying one position, unrelated. */
function seedWorld(status = 'planning', endDate: string | null = '2026-02-08') {
  useTripStore().applyChanges([
    change(TABLE.trips, TRIP_ID, { name: 'Samedan', year: 2026, status, end_date: endDate }),
    change(TABLE.travelers, 'trv-1', { trip_id: TRIP_ID, name: 'Andy' }),
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

describe('addGroupToTrip (FR-27.10)', () => {
  it('puts the group’s positions on the trip carrying its provenance', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()

    const report = orch.addGroupToTrip(TRIP_ID, GROUP_ID)

    const rows = tripStore.getItems(TRIP_ID)
    expect(rows.map((r) => r.name)).toEqual(['Kamera'])
    expect(rows[0]?.source_template_id).toBe(GROUP_ID)
    expect(rows[0]?.source_item_id).toBe(ITEM_ID)
    expect(report).toEqual({ groupName: 'Makro Fotografie', added: 1, alreadyPresent: [] })
  })

  it('never flags the added rows Missing — the plan grew, nothing was missing', async () => {
    // FR-9.1 would otherwise feed M14 a lie: a row that came *from* a
    // template must not produce an "add it to the template" proposal.
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld('active')

    orch.addGroupToTrip(TRIP_ID, GROUP_ID)

    expect(tripStore.getItems(TRIP_ID).map((r) => r.flag_missing)).toEqual([false])
  })

  it('materialises FR-27.7 preparation tasks as todos on the generated row', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    useMasterStore().applyChanges([
      change(TABLE.templateItemTasks, 'task-1', {
        template_item_id: 'pos-1',
        task: 'Akkus laden',
      }),
    ])

    orch.addGroupToTrip(TRIP_ID, GROUP_ID)

    const row = tripStore.getItems(TRIP_ID)[0]
    const todos = tripStore.getTodos(TRIP_ID).filter((t) => t.trip_item_id === row?.id)
    expect(todos.map((t) => t.body)).toEqual(['Akkus laden'])
  })

  it('reports what the trip already carried instead of duplicating it', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    orch.quickAddItem(TRIP_ID, 'Kamera', { sourceItemId: ITEM_ID }, false)

    const report = orch.addGroupToTrip(TRIP_ID, GROUP_ID)

    expect(tripStore.getItems(TRIP_ID)).toHaveLength(1)
    expect(report).toEqual({
      groupName: 'Makro Fotografie',
      added: 0,
      alreadyPresent: ['Kamera'],
    })
  })

  it('pulls the required companions of what it placed (FR-20.4)', async () => {
    // The same rule the single-item quick-add applies: an item added to a trip
    // brings its required companions. Adding twelve of them at once must not
    // be the one path that skips it.
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()
    useMasterStore().applyChanges([
      change(TABLE.items, 'item-akku', { name: 'Ersatzakku', weight_grams: 60 }),
      change(TABLE.itemDependencies, 'dep-1', {
        item_id: 'item-akku',
        depends_on_item_id: ITEM_ID,
        mode: 'required',
        quantity: 1,
      }),
    ])

    orch.addGroupToTrip(TRIP_ID, GROUP_ID)

    expect(
      tripStore
        .getItems(TRIP_ID)
        .map((r) => r.name)
        .sort(),
    ).toEqual(['Ersatzakku', 'Kamera'])
  })

  it('registers the group as a source, so later edits are offered (FR-27.4)', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()

    orch.addGroupToTrip(TRIP_ID, GROUP_ID)

    expect(tripStore.getTemplateSources(TRIP_ID).map((s) => s.template_id)).toEqual([GROUP_ID])
  })

  it('registers the group only once when it is added twice', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld()

    orch.addGroupToTrip(TRIP_ID, GROUP_ID)
    orch.addGroupToTrip(TRIP_ID, GROUP_ID)

    expect(tripStore.getTemplateSources(TRIP_ID)).toHaveLength(1)
    expect(tripStore.getItems(TRIP_ID)).toHaveLength(1)
  })

  it('adds to a past trip but registers nothing — a past trip follows no group', async () => {
    const orch = await localOrchestrator()
    const tripStore = useTripStore()
    seedWorld('archived')

    const report = orch.addGroupToTrip(TRIP_ID, GROUP_ID)

    // The positive signal that the add itself ran: without it, "no sources"
    // would be green for a call that did nothing at all.
    expect(report?.added).toBe(1)
    expect(tripStore.getItems(TRIP_ID)).toHaveLength(1)
    expect(tripStore.getTemplateSources(TRIP_ID)).toEqual([])
  })

  it('refuses a trip whose rows are not on the device — "not pulled" is not "empty"', async () => {
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      today: () => TODAY,
    })
    seedWorld()

    // No trip partition was pulled in this server-mode orchestrator, so the
    // list it would resolve against is unknown rather than empty.
    expect(orch.addGroupToTrip(TRIP_ID, GROUP_ID)).toBeNull()
    expect(useTripStore().getItems(TRIP_ID)).toEqual([])
  })
})
