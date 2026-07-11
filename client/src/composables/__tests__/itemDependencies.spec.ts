import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'

// Item-dependency runtime behavior (Addendum 3.20): the co-skip cascade
// on the main item (FR-20.2) and required companions joining a quick-add
// automatically (FR-20.4/FR-5.6).

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ changes: [], next_cursor: 1, has_more: false }), {
          status: 200,
        }),
      ),
    ),
  )
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function seedMaster() {
  const masterStore = useMasterStore()
  masterStore.applyChanges([
    { seq: 1, table: 'items', id: 'camera', deleted: false, row: { name: 'Kamera' } },
    { seq: 2, table: 'items', id: 'battery', deleted: false, row: { name: 'Ersatzakku' } },
    { seq: 3, table: 'items', id: 'plate', deleted: false, row: { name: 'Arca-Platte' } },
    {
      seq: 4,
      table: 'item_dependencies',
      id: 'dep1',
      deleted: false,
      row: { item_id: 'battery', depends_on_item_id: 'camera', mode: 'required' },
    },
    {
      seq: 5,
      table: 'item_dependencies',
      id: 'dep2',
      deleted: false,
      row: { item_id: 'plate', depends_on_item_id: 'camera', mode: 'suggested' },
    },
  ])
}

function seedTripItem(id: string, sourceItemId: string | null, state = 'open') {
  const tripStore = useTripStore()
  tripStore.applyChange({
    seq: 10,
    table: 'trip_items',
    id,
    deleted: false,
    row: {
      trip_id: 't1',
      name: id,
      source_item_id: sourceItemId,
      quantity: 1,
      packed_count: 0,
      state,
      mode: 'pack',
      updated_hlc: '',
    },
  })
}

describe('co-skip cascade (FR-20.2)', () => {
  it('skipping the main item co-skips its dependents', () => {
    seedMaster()
    seedTripItem('ti-camera', 'camera')
    seedTripItem('ti-battery', 'battery')
    seedTripItem('ti-other', null)
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    const cameraItem = tripStore.getItems('t1').find((i) => i.id === 'ti-camera')!
    orch.skipItem('t1', cameraItem)

    const states = new Map(tripStore.getItems('t1').map((i) => [i.id, i.state]))
    expect(states.get('ti-camera')).toBe('skipped')
    expect(states.get('ti-battery')).toBe('skipped')
    expect(states.get('ti-other')).toBe('open')
  })

  it('skipping the dependent leaves the main item alone', () => {
    seedMaster()
    seedTripItem('ti-camera', 'camera')
    seedTripItem('ti-battery', 'battery')
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    const batteryItem = tripStore.getItems('t1').find((i) => i.id === 'ti-battery')!
    orch.skipItem('t1', batteryItem)

    const states = new Map(tripStore.getItems('t1').map((i) => [i.id, i.state]))
    expect(states.get('ti-battery')).toBe('skipped')
    expect(states.get('ti-camera')).toBe('open')
  })
})

describe('quick-add companions (FR-20.4/FR-5.6)', () => {
  it('adds required companions alongside a quick-added main item', () => {
    seedMaster()
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    orch.quickAddItem('t1', 'Kamera', { sourceItemId: 'camera' }, false)

    const bySource = new Map(tripStore.getItems('t1').map((i) => [i.source_item_id, i]))
    expect(bySource.has('camera')).toBe(true)
    expect(bySource.get('battery')?.name).toBe('Ersatzakku')
    // Suggested companions never join without a tap.
    expect(bySource.has('plate')).toBe(false)
  })

  it('does not duplicate a companion already on the list (FR-20.3)', () => {
    seedMaster()
    seedTripItem('ti-battery', 'battery')
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    orch.quickAddItem('t1', 'Kamera', { sourceItemId: 'camera' }, false)

    const batteries = tripStore.getItems('t1').filter((i) => i.source_item_id === 'battery')
    expect(batteries).toHaveLength(1)
  })

  it('leaves ad-hoc quick-adds without a master match untouched', () => {
    seedMaster()
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    orch.quickAddItem('t1', 'Irgendwas', {}, false)

    expect(tripStore.getItems('t1')).toHaveLength(1)
  })
})

describe('dependency master actions', () => {
  it('addItemDependency applies optimistically and deleteItemDependency removes it', () => {
    seedMaster()
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const masterStore = useMasterStore()

    const id = orch.addItemDependency('battery', 'camera', { mode: 'suggested' })
    // dep1 from the seed plus the new relation
    expect(masterStore.dependencyList).toHaveLength(3)
    expect(masterStore.dependencyList.find((d) => d.id === id)?.mode).toBe('suggested')

    orch.deleteItemDependency(id)
    expect(masterStore.dependencyList).toHaveLength(2)

    orch.updateItemDependency(
      masterStore.dependencyList.find((d) => d.id === 'dep2')!,
      {
        mode: 'required',
      },
    )
    expect(masterStore.dependencyList.find((d) => d.id === 'dep2')?.mode).toBe('required')
  })
})
