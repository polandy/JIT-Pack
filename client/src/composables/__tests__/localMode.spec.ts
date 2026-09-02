/**
 * Local Mode orchestration (Addendum 3.19): same orchestrator
 * interface, but mutations persist to IndexedDB and no network or
 * WebSocket is ever touched (FR-19.2); startup loads through the
 * regular applyChanges path; G-2 shows the *local* state (FR-19.6).
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { t } from '@/i18n'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { installHarness } from '@/__tests__/harness'
import { loadMigrationPending, switchToServer } from '@/mode'

let fetchMock: ReturnType<typeof vi.fn>
let wsMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;({ fetch: fetchMock, webSocket: wsMock } = installHarness())
  globalThis.indexedDB = new IDBFactory()
})

function newLocalOrch(persistence = new IndexedDBPersistence()) {
  return useSyncOrchestrator({ baseUrl: '', getToken: () => null, local: persistence })
}

describe('Local Mode', () => {
  it('mutations persist to IndexedDB and never touch the network', async () => {
    const persistence = new IndexedDBPersistence()
    const orch = newLocalOrch(persistence)
    const trips = useTripStore()

    orch.quickAddItem('t1', 'Socken', {}, false)

    expect(trips.getItems('t1')).toHaveLength(1)
    await vi.waitFor(async () => {
      const rows = await persistence.load()
      expect(rows.some((r) => r.table === 'trip_items')).toBe(true)
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(wsMock).not.toHaveBeenCalled()
  })

  it('connect() loads persisted rows through applyChanges (FR-19.2)', async () => {
    const persistence = new IndexedDBPersistence()
    await persistence.save([
      {
        seq: 0,
        table: 'trips',
        id: 't1',
        deleted: false,
        row: { name: 'Engadin', end_date: '2026-08-10', status: 'planning' },
      },
      { seq: 0, table: 'items', id: 'i1', deleted: false, row: { name: 'Socken' } },
    ])

    const orch = newLocalOrch(persistence)
    await orch.connect()

    expect(useTripStore().getTrip('t1')?.name).toBe('Engadin')
    expect(useMasterStore().getItem('i1')?.name).toBe('Socken')
    expect(wsMock).not.toHaveBeenCalled()
  })

  // FR-2.8: the hydration is also the answer to "is the trip list here?",
  // which M2 asks before it picks a segment. A Local Mode device never pulls,
  // so this load is the only thing that can ever make it true.
  it('the load is what tells M2 the trip list has arrived (FR-2.8)', async () => {
    const orch = newLocalOrch()

    expect(orch.masterDataLoaded()).toBe(false)
    await orch.connect()

    expect(orch.masterDataLoaded()).toBe(true)
  })

  /**
   * C-3a. Local Mode has no server to cascade, and `persistence.write`
   * deletes exactly the keys it is handed — so a delete that names only
   * `trips/<id>` leaves every child row on the device and `load` replays
   * them on the next start. The live session hid it: the store had already
   * dropped its buckets, so the screen was right and the disk was not.
   */
  it('a deleted trip takes its rows off the device, not just off the screen', async () => {
    const persistence = new IndexedDBPersistence()
    await persistence.save([
      { seq: 0, table: 'trips', id: 't1', deleted: false, row: { name: 'Engadin', year: 2026 } },
      { seq: 0, table: 'trips', id: 't2', deleted: false, row: { name: 'Samedan', year: 2026 } },
      {
        seq: 0,
        table: 'trip_items',
        id: 'i1',
        deleted: false,
        row: { trip_id: 't1', name: 'Socken', quantity: 1, packed_count: 0, mode: 'pack' },
      },
      {
        seq: 0,
        table: 'travelers',
        id: 'trav1',
        deleted: false,
        row: { trip_id: 't1', name: 'Andy' },
      },
      {
        seq: 0,
        table: 'containers',
        id: 'cnt1',
        deleted: false,
        row: { trip_id: 't1', name: 'Rucksack' },
      },
      {
        seq: 0,
        table: 'comments',
        id: 'com1',
        deleted: false,
        row: { trip_id: 't1', body: 'Karte einpacken' },
      },
      {
        seq: 0,
        table: 'trip_members',
        id: 'mem1',
        deleted: false,
        row: { trip_id: 't1', user_id: 'u1', role: 'owner' },
      },
      {
        seq: 0,
        table: 'trip_template_sources',
        id: 'src1',
        deleted: false,
        row: { trip_id: 't1', template_id: 'tpl1' },
      },
      {
        seq: 0,
        table: 'trip_generated_positions',
        id: 'gen1',
        deleted: false,
        row: { trip_id: 't1', template_item_id: 'pos1', trip_item_id: 'i1' },
      },
      {
        seq: 0,
        table: 'trip_applied_changes',
        id: 'app1',
        deleted: false,
        row: { trip_id: 't1', template_id: 'tpl1', created_at: '2026-09-01T10:00:00Z' },
      },
      {
        seq: 0,
        table: 'travelers',
        id: 'trav2',
        deleted: false,
        row: { trip_id: 't2', name: 'Grace' },
      },
    ])

    const orch = newLocalOrch(persistence)
    await orch.connect()
    orch.deleteTrip('t1')
    await persistence.whenSettled()

    const left = (await persistence.load()).map((r) => `${r.table}/${r.id}`).sort()
    expect(left).toEqual(['travelers/trav2', 'trips/t2'])
  })

  it('the rows of a deleted trip do not come back on the next start', async () => {
    const persistence = new IndexedDBPersistence()
    await persistence.save([
      { seq: 0, table: 'trips', id: 't1', deleted: false, row: { name: 'Engadin', year: 2026 } },
      {
        seq: 0,
        table: 'trip_items',
        id: 'i1',
        deleted: false,
        row: { trip_id: 't1', name: 'Socken', quantity: 1, packed_count: 0, mode: 'pack' },
      },
    ])

    const first = newLocalOrch(persistence)
    await first.connect()
    first.deleteTrip('t1')
    await persistence.whenSettled()

    // A fresh store is the point: the live one had already dropped its
    // buckets, which is exactly what made the defect invisible.
    setActivePinia(createPinia())
    await newLocalOrch(new IndexedDBPersistence()).connect()

    expect(useTripStore().getTrip('t1')).toBeUndefined()
    expect(useTripStore().getItems('t1')).toEqual([])
  })

  /**
   * The same defect on the master side (C-3a): the delete cascades in the
   * schema and the server announces the children, but Local Mode has no
   * server to announce anything, so the change list is the whole cascade.
   */
  it('a deleted master item takes its tags and dependencies off the device', async () => {
    const persistence = new IndexedDBPersistence()
    await persistence.save([
      { seq: 0, table: 'items', id: 'i1', deleted: false, row: { name: 'Kamera' } },
      { seq: 0, table: 'items', id: 'i2', deleted: false, row: { name: 'Objektiv' } },
      { seq: 0, table: 'tags', id: 'g1', deleted: false, row: { name: 'Foto' } },
      {
        seq: 0,
        table: 'item_tags',
        id: 'a1',
        deleted: false,
        row: { item_id: 'i1', tag_id: 'g1', position: 0 },
      },
      {
        seq: 0,
        table: 'item_dependencies',
        id: 'd1',
        deleted: false,
        row: { item_id: 'i1', depends_on_item_id: 'i2', quantity: 1, mode: 'pack' },
      },
    ])

    const orch = newLocalOrch(persistence)
    await orch.connect()
    orch.deleteMasterItem('i1')
    await persistence.whenSettled()

    const left = (await persistence.load()).map((r) => `${r.table}/${r.id}`).sort()
    expect(left).toEqual(['items/i2', 'tags/g1'])
  })

  it('a deleted Vorlage takes its positions, their tasks and its includes off the device', async () => {
    const persistence = new IndexedDBPersistence()
    await persistence.save([
      {
        seq: 0,
        table: 'templates',
        id: 'tpl1',
        deleted: false,
        row: { name: 'Ferien', kind: 'holiday', owner_id: 'u1' },
      },
      {
        seq: 0,
        table: 'templates',
        id: 'grp1',
        deleted: false,
        row: { name: 'Makro', kind: 'group', owner_id: 'u1' },
      },
      {
        seq: 0,
        table: 'template_items',
        id: 'pos1',
        deleted: false,
        row: {
          template_id: 'tpl1',
          item_id: 'i1',
          quantity: 1,
          assignment: 'trip_global',
          dedup: 'max',
          default_mode: 'pack',
          late_packer: 0,
        },
      },
      {
        seq: 0,
        table: 'template_item_tasks',
        id: 'task1',
        deleted: false,
        row: { template_item_id: 'pos1', task: 'Akku laden' },
      },
      {
        seq: 0,
        table: 'template_includes',
        id: 'inc1',
        deleted: false,
        row: { template_id: 'tpl1', included_template_id: 'grp1' },
      },
    ])

    const orch = newLocalOrch(persistence)
    await orch.connect()
    orch.deleteTemplate('tpl1')
    await persistence.whenSettled()

    const left = (await persistence.load()).map((r) => `${r.table}/${r.id}`).sort()
    expect(left).toEqual(['templates/grp1'])
  })

  it('a deleted trip item takes its comments and todos off the device', async () => {
    const persistence = new IndexedDBPersistence()
    await persistence.save([
      { seq: 0, table: 'trips', id: 't1', deleted: false, row: { name: 'Engadin', year: 2026 } },
      {
        seq: 0,
        table: 'trip_items',
        id: 'ti1',
        deleted: false,
        row: { trip_id: 't1', name: 'Kamera', quantity: 1, packed_count: 0, mode: 'pack' },
      },
      {
        seq: 0,
        table: 'comments',
        id: 'com1',
        deleted: false,
        row: { trip_id: 't1', trip_item_id: 'ti1', body: 'Kratzer' },
      },
      {
        seq: 0,
        table: 'comments',
        id: 'todo1',
        deleted: false,
        row: {
          trip_id: 't1',
          trip_item_id: 'ti1',
          body: 'Akku laden',
          is_task: true,
          task_state: 'open',
        },
      },
      // Trip-level: a null trip_item_id, so the row's delete leaves it.
      {
        seq: 0,
        table: 'comments',
        id: 'com2',
        deleted: false,
        row: { trip_id: 't1', body: 'Karte mitnehmen' },
      },
    ])

    const orch = newLocalOrch(persistence)
    await orch.connect()
    orch.removeAddedItem('t1', 'ti1')
    await persistence.whenSettled()

    const left = (await persistence.load()).map((r) => `${r.table}/${r.id}`).sort()
    expect(left).toEqual(['comments/com2', 'trips/t1'])
  })

  it('createTripFromWizard works fully offline and persists everything', async () => {
    const persistence = new IndexedDBPersistence()
    const orch = newLocalOrch(persistence)

    orch.createTripFromWizard({
      name: 'Engadin',
      year: 2026,
      startDate: null,
      endDate: '2026-08-10',
      attributes: null,
      travelers: [{ name: 'Andy' }],
      items: [
        {
          source_item_id: 'i1',
          source_template_id: 'tpl1',
          name: 'Socken',
          category_name: null,
          weight_grams: null,
          value_cents: null,
          quantity: 2,
          mode: 'pack',
          late_packer: false,
          traveler_index: 0,
          // FR-27.7 in Local Mode (invariant 5): the todo is generated on the
          // device, so it has to persist without a server having seen it.
          tasks: ['Waschen nicht vergessen'],
        },
      ],
    })

    await vi.waitFor(async () => {
      const tables = (await persistence.load()).map((r) => r.table).sort()
      expect(tables).toEqual(['comments', 'travelers', 'trip_items', 'trips'])
    })
    expect(fetchMock).not.toHaveBeenCalled()

    const tripId = useTripStore().tripList[0]!.id
    const item = useTripStore().getItems(tripId)[0]!
    expect(
      useTripStore()
        .getItemTodos(tripId, item.id)
        .map((t) => t.body),
    ).toEqual(['Waschen nicht vergessen'])
  })

  it('reports the G-2 local state (FR-19.6)', () => {
    const orch = newLocalOrch()

    expect(orch.syncStatus.state.value).toBe('local')
    // The tooltip is the catalogue's string now (NFR-4.12), not a literal.
    expect(orch.syncStatus.label.value).toBe(t('sync.local'))
  })

  it('composition edits (include + task) reach the store and IndexedDB (FR-27.1/27.7)', async () => {
    const persistence = new IndexedDBPersistence()
    const orch = newLocalOrch(persistence)
    const master = useMasterStore()

    const vacId = orch.createTemplate('Fotoreise', 'template')!
    const grpId = orch.createTemplate('Makro', 'group')!
    orch.addTemplateInclude(vacId, grpId)
    const itemId = orch.createMasterItem('Kamera')
    const positionId = orch.addTemplateItem(grpId, itemId, { assignment: 'trip_global' })
    const taskId = orch.addTemplateItemTask(positionId, 'Akkus laden')

    expect(master.getIncludes(vacId).map((i) => i.included_template_id)).toEqual([grpId])
    expect(master.resolve(vacId).positions.map((p) => p.item_id)).toEqual([itemId])
    expect(master.getTemplateItemTasks(positionId).map((t) => t.task)).toEqual(['Akkus laden'])

    await vi.waitFor(async () => {
      const rows = await persistence.load()
      expect(rows.some((r) => r.table === 'template_includes')).toBe(true)
      expect(rows.some((r) => r.table === 'template_item_tasks')).toBe(true)
    })

    orch.deleteTemplateItemTask(taskId)
    expect(master.getTemplateItemTasks(positionId)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stamps a write only after hydration — the startup load is not a change (FR-19.8)', async () => {
    const persistence = new IndexedDBPersistence()
    await persistence.save([
      { seq: 0, table: 'items', id: 'i1', deleted: false, row: { name: 'Socken' } },
    ])
    const onLocalWrite = vi.fn()
    const orch = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: persistence,
      onLocalWrite,
    })

    await orch.connect()
    expect(useMasterStore().itemList).toHaveLength(1)
    // The positive signal that the funnel ran: the row is in the store. And
    // the stamp did not move for it.
    expect(onLocalWrite).not.toHaveBeenCalled()

    orch.quickAddItem('t1', 'Zahnbürste', {}, false)
    expect(onLocalWrite).toHaveBeenCalledTimes(1)
  })

  it('a Local Mode restore does not finish a move that never started (FR-19.8)', () => {
    // The flag can only be set by the switch, and a device still in Local
    // Mode has not switched — a restore here is an ordinary restore.
    switchToServer('http://localhost')
    localStorage.setItem('jitpack_mode', 'local')
    const orch = newLocalOrch()

    orch.commitPortableRestore([])

    expect(loadMigrationPending()).toBe(true)
  })
})
