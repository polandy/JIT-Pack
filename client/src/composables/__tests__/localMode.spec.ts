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
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'

let fetchMock: ReturnType<typeof vi.fn>
let wsMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  globalThis.indexedDB = new IDBFactory()
  fetchMock = vi.fn()
  wsMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', wsMock)
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
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

    const vacId = orch.createTemplate('Fotoreise', 'template')
    const grpId = orch.createTemplate('Makro', 'group')
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
})
