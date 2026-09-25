/**
 * The shopping module through the real orchestrator (FR-30.3, ADR-066).
 *
 * The orchestrator never imports the module; it is handed the module's store
 * as a `FeatureStore`, the way `App.vue` hands it over. These cases pin the
 * three places that hand-over has to hold — the pull funnel, the trip
 * cascade and the write path — in both modes, because a table the funnel
 * drops fails silently and Local Mode is where a missed cascade is durable.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { installHarness, type Harness } from '@/__tests__/harness'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { createShoppingActions, ownEntriesSource, shoppingCloseCrossing } from '../actions'
import { duePurchaseCount } from '..'
import { shoppingFeatureStore, useShoppingStore } from '../store'

let harness: Harness

beforeEach(() => {
  harness = installHarness()
  globalThis.indexedDB = new IDBFactory()
})

function serverOrch() {
  return useSyncOrchestrator({
    baseUrl: 'http://localhost',
    getToken: () => null,
    features: [shoppingFeatureStore()],
  })
}

function localOrch(persistence = new IndexedDBPersistence()) {
  return useSyncOrchestrator({
    baseUrl: '',
    getToken: () => null,
    local: persistence,
    features: [shoppingFeatureStore()],
  })
}

const milk = {
  seq: 1,
  table: TABLE.shoppingEntries,
  id: 'e1',
  deleted: false,
  row: { trip_id: 't1', name: 'Milch', list: 'buy_local', bought: 0 },
}

describe('Server Mode', () => {
  it('routes a pulled entry to the shopping store (FR-30.3)', async () => {
    const orch = serverOrch()
    harness.mockPull([milk])

    await orch.drainTrip('t1')

    expect(
      useShoppingStore()
        .openEntries('t1', 'buy_local')
        .map((e) => e.name),
    ).toEqual(['Milch'])
    // …and to it alone: the packing list never holds an entry.
    expect(useTripStore().getItems('t1')).toEqual([])
  })

  it('a trip’s tombstone takes its entries off the device, since none of theirs will arrive', async () => {
    const orch = serverOrch()
    harness.mockPull([milk])
    await orch.drainTrip('t1')
    expect(useShoppingStore().getEntries('t1')).toHaveLength(1)

    harness.mockPull([{ seq: 2, table: TABLE.trips, id: 't1', deleted: true, row: null }])
    await orch.drainMaster()

    expect(useShoppingStore().getEntries('t1')).toEqual([])
  })

  it('an entry written through the module host is pushed on the trip’s partition', async () => {
    const orch = serverOrch()
    harness.mockDrain()

    createShoppingActions(orch.moduleHost).addEntry('t1', 'buy_before', 'Sonnencreme')
    await orch.drainTrip('t1')

    expect(harness.pushedMutations()).toMatchObject([
      {
        op: 'insert',
        table: TABLE.shoppingEntries,
        fields: { trip_id: 't1', name: 'Sonnencreme', list: 'buy_before', bought: 0 },
      },
    ])
    const [pushTo] = harness.fetch.mock.calls.map((call) => String(call[0]))
    expect(pushTo).toContain('/trips/t1/')
  })
})

/*
 * FR-30.10: an entry's due day travels as one field of its own, so a day set
 * on one device and a tag on another both stand (NFR-4.2a) — and an edit
 * that leaves the day alone does not write it.
 */
describe('The due day (FR-30.10)', () => {
  it('is written with a new entry, changed alone, and taken off with null', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const actions = createShoppingActions(orch.moduleHost)
    actions.addEntry('t1', 'buy_local', 'Milch', null, '2026-07-09')
    const shoppingStore = useShoppingStore()
    const milk = () => shoppingStore.getEntries('t1')[0]!
    expect(milk().due_date).toBe('2026-07-09')

    actions.updateEntry(milk(), { name: 'Milch', tag: 'Supermarkt' })
    actions.updateEntry(milk(), { name: 'Milch', tag: 'Supermarkt', dueDate: '2026-07-09' })
    actions.updateEntry(milk(), { name: 'Milch', tag: 'Supermarkt', dueDate: null })
    expect(milk().due_date).toBeNull()
    await orch.drainTrip('t1')

    expect(harness.pushedMutations().map((m) => m.fields)).toMatchObject([
      { name: 'Milch', due_date: '2026-07-09' },
      { tag: 'Supermarkt' },
      { due_date: null },
    ])
    // The tag's edit named no day, and the same day again wrote nothing.
    expect(harness.pushedMutations()[1]!.fields).not.toHaveProperty('due_date')
    expect(harness.pushedMutations()).toHaveLength(3)
  })

  it('counts the open entries due by tomorrow on both lists for Local Mode’s hint', () => {
    const actions = createShoppingActions(serverOrch().moduleHost)
    actions.addEntry('t1', 'buy_before', 'Hut', null, '2026-07-01')
    actions.addEntry('t1', 'buy_local', 'Milch', null, '2026-07-09')
    actions.addEntry('t1', 'buy_local', 'Kerzen', null, '2026-07-10')
    actions.addEntry('t1', 'buy_local', 'Brot')
    actions.addEntry('t1', 'buy_local', 'Eier', null, '2026-07-08')
    actions.setBought(
      useShoppingStore()
        .getEntries('t1')
        .find((e) => e.name === 'Eier')!,
      true,
    )

    expect(duePurchaseCount()('t1', '2026-07-08')).toBe(2)
  })

  it('a bought entry’s line carries no day — a purchase made is never overdue', () => {
    const orch = serverOrch()
    const actions = createShoppingActions(orch.moduleHost)
    actions.addEntry('t1', 'buy_local', 'Milch', null, '2026-07-01')
    const shoppingStore = useShoppingStore()
    const own = ownEntriesSource(shoppingStore, actions)
    expect(own.open('t1', 'buy_local')[0]!.dueDate).toBe('2026-07-01')
    actions.setBought(shoppingStore.getEntries('t1')[0]!, true)
    expect(own.bought('t1', 'buy_local')[0]!.dueDate).toBeNull()
  })
})

describe('The module host', () => {
  // FR-30.4: the tap's time comes from the orchestrator's own clock — the one
  // the HLC reads — so a purchase and the clock that orders it cannot disagree.
  it('stamps a purchase with the orchestrator’s clock', async () => {
    const at = Date.parse('2026-09-19T14:32:00Z')
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      now: () => at,
      features: [shoppingFeatureStore()],
    })
    harness.mockDrain()
    const actions = createShoppingActions(orch.moduleHost)
    actions.addEntry('t1', 'buy_local', 'Brot')
    const [entry] = useShoppingStore().getEntries('t1')
    actions.setBought(entry!, true)
    await orch.drainTrip('t1')

    expect(harness.pushedMutations().at(-1)).toMatchObject({
      op: 'upsert',
      fields: { bought: 1, bought_at: new Date(at).toISOString() },
    })
  })
})

/*
 * FR-7.12: the shopping list's share of closing the packing. The packing
 * side cannot import the module, so it runs this crossing through the
 * composition root; what is pinned here is that the crossing moves the
 * list's own open entries before departure — and only those — and that its
 * undo puts back exactly what it moved.
 */
describe('The close of the packing (FR-7.12)', () => {
  it('moves the open entries before departure to the destination, and takes them back', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const actions = createShoppingActions(orch.moduleHost)
    actions.addEntry('t1', 'buy_before', 'Sonnenhut')
    actions.addEntry('t1', 'buy_before', 'Kaffee')
    actions.addEntry('t1', 'buy_local', 'Brot')
    const shoppingStore = useShoppingStore()
    const coffee = shoppingStore.getEntries('t1').find((entry) => entry.name === 'Kaffee')!
    actions.setBought(coffee, true)

    const crossing = shoppingCloseCrossing(shoppingStore, actions)
    expect(crossing.pending('t1')).toBe(1)

    const effect = crossing.cross('t1')
    expect(effect.count).toBe(1)
    const listOf = (name: string) =>
      shoppingStore.getEntries('t1').find((e) => e.name === name)!.list
    expect(listOf('Sonnenhut')).toBe('buy_local')
    // Bought before departure: it stays where it was bought.
    expect(listOf('Kaffee')).toBe('buy_before')
    expect(crossing.pending('t1')).toBe(0)

    await orch.drainTrip('t1')
    expect(harness.pushedMutations().at(-1)).toMatchObject({
      op: 'upsert',
      fields: { list: 'buy_local' },
    })

    effect.undo()
    expect(listOf('Sonnenhut')).toBe('buy_before')
  })
})

describe('Local Mode', () => {
  it('an entry survives a restart', async () => {
    const persistence = new IndexedDBPersistence()
    const first = localOrch(persistence)
    await first.connect()
    createShoppingActions(first.moduleHost).addEntry('t1', 'buy_local', 'Brot')
    await persistence.whenSettled()

    setActivePinia(createPinia())
    await localOrch(new IndexedDBPersistence()).connect()

    expect(
      useShoppingStore()
        .openEntries('t1', 'buy_local')
        .map((e) => e.name),
    ).toEqual(['Brot'])
  })

  it('a deleted trip takes its entries off the device (C-3a)', async () => {
    const persistence = new IndexedDBPersistence()
    await persistence.save([
      {
        seq: 0,
        table: TABLE.trips,
        id: 't1',
        deleted: false,
        row: { name: 'Engadin', year: 2026 },
      },
      { ...milk, seq: 0 },
    ])

    const orch = localOrch(persistence)
    await orch.connect()
    orch.deleteTrip('t1')
    await persistence.whenSettled()

    expect((await persistence.load()).map((r) => `${r.table}/${r.id}`)).toEqual([])
    expect(useShoppingStore().getEntries('t1')).toEqual([])
  })
})
