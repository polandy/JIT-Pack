/**
 * Persistence wiring for the master-data editors (M8/M10) and M5's
 * assignment controls: every UI edit must enqueue a mutation on the
 * correct partition, not just mutate the store (FR-19.2 groundwork —
 * optimistic rows become authoritative in Local Mode).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { PullResponse, PushResponse } from '@/api/types'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal(
    'WebSocket',
    vi.fn(() => ({
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
      onopen: null,
      onmessage: null,
      onclose: null,
    })),
  )
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function mockDrain() {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ results: [], pull_hint: { next_cursor: 1 } } satisfies PushResponse),
      { status: 200 },
    ),
  )
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ changes: [], next_cursor: 1, has_more: false } satisfies PullResponse),
      { status: 200 },
    ),
  )
}

function newOrch() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

describe('master data actions', () => {
  it('updateMasterItem patches the store and pushes to the master partition', async () => {
    const orch = newOrch()
    const master = useMasterStore()
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'i1',
      deleted: false,
      row: { name: 'Socken', weight_grams: 80 },
    })
    mockDrain()

    orch.updateMasterItem(master.getItem('i1')!, { weight_grams: 500 })

    const item = master.getItem('i1')!
    expect(item.weight_grams).toBe(500)
    expect(item.name).toBe('Socken')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/master/sync')
  })

  // FR-28.1/28.8, and a photo bug found beside it: the optimistic row is
  // rebuilt from the item, so any field the rebuild forgets is blanked until
  // the next pull overwrites it. Editing a weight must not silently drop the
  // mark or the reference photo.
  it('updateMasterItem keeps the fields it is not changing — mark and photo included (FR-28.1)', async () => {
    const orch = newOrch()
    const master = useMasterStore()
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'i1',
      deleted: false,
      row: { name: 'Socken', weight_grams: 80, icon: '\u{1F9E6}', image_hash: 'sha-1' },
    })
    mockDrain()

    orch.updateMasterItem(master.getItem('i1')!, { weight_grams: 500 })

    const item = master.getItem('i1')!
    expect(item.icon).toBe('\u{1F9E6}')
    expect(item.image_hash).toBe('sha-1')
  })

  it('updateTemplate keeps the mark it is not changing (FR-28.8)', async () => {
    const orch = newOrch()
    const master = useMasterStore()
    master.applyChange({
      seq: 0,
      table: 'templates',
      id: 'tpl-1',
      deleted: false,
      row: { owner_id: 'me', name: 'Camping Basis', kind: 'group', icon: '\u{26FA}' },
    })
    mockDrain()

    orch.updateTemplate(master.getTemplate('tpl-1')!, { name: 'Camping' })

    const tpl = master.getTemplate('tpl-1')!
    expect(tpl.name).toBe('Camping')
    expect(tpl.icon).toBe('\u{26FA}')
  })

  it('template item lifecycle: add, update preserving fields, delete', () => {
    const orch = newOrch()
    const master = useMasterStore()
    mockDrain()
    mockDrain()
    mockDrain()

    const tiId = orch.addTemplateItem('tpl-1', 'i1', { quantity: 3 })
    expect(master.getTemplateItems('tpl-1')).toHaveLength(1)

    orch.updateTemplateItem(master.getTemplateItems('tpl-1')[0]!, { dedup: 'sum' })
    const ti = master.getTemplateItems('tpl-1')[0]!
    expect(ti.dedup).toBe('sum')
    expect(ti.quantity).toBe(3)

    orch.deleteTemplateItem(tiId)
    expect(master.getTemplateItems('tpl-1')).toHaveLength(0)
  })

  it('createMasterItem and deleteMasterItem round-trip the store', () => {
    const orch = newOrch()
    const master = useMasterStore()
    mockDrain()
    mockDrain()

    const id = orch.createMasterItem('Stirnlampe')
    expect(master.getItem(id)?.name).toBe('Stirnlampe')

    orch.deleteMasterItem(id)
    expect(master.getItem(id)).toBeUndefined()
  })

  it('createTemplate adds the template and pushes to master (M7)', async () => {
    const orch = newOrch()
    const master = useMasterStore()
    mockDrain()

    const id = orch.createTemplate('Ski-Trip')

    const tpl = master.getTemplate(id)
    expect(tpl?.name).toBe('Ski-Trip')
    // One shared list (FR-1.6 MVP) — there is no publish state to land under.
    expect(master.templateList.map((t) => t.id)).toContain(id)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/master/sync')
  })
})

describe('M5 assignment actions on the trip partition', () => {
  it('assignTraveler persists instead of only patching the store', async () => {
    const orch = newOrch()
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: 'ti1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Socken',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
      },
    })
    mockDrain()

    orch.assignTraveler('t1', trips.getItems('t1')[0]!, 'trav-9')

    expect(trips.getItems('t1')[0]!.assigned_traveler_id).toBe('trav-9')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/trips/t1/sync')
  })

  it('setLatePacker and assignContainer keep remaining fields intact', () => {
    const orch = newOrch()
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: 'ti1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Socken',
        quantity: 3,
        packed_count: 2,
        state: 'partial',
        mode: 'pack',
      },
    })
    mockDrain()
    mockDrain()

    orch.assignContainer('t1', trips.getItems('t1')[0]!, 'cont-1')
    orch.setLatePacker('t1', trips.getItems('t1')[0]!, true)

    const item = trips.getItems('t1')[0]!
    expect(item.container_id).toBe('cont-1')
    expect(item.late_packer).toBe(true)
    expect(item.packed_count).toBe(2)
    expect(item.state).toBe('partial')
  })
})

describe('FR-9.1 review flags (M5 Details)', () => {
  function seedRow() {
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: 'ti1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Regenhose',
        quantity: 1,
        packed_count: 1,
        state: 'packed',
        mode: 'pack',
      },
    })
    return trips
  }

  /**
   * The optimistic row is a *replacement*, not a patch — both the store
   * and IndexedDB put the whole row — so a projection that forgets a
   * column erases it, permanently in Local Mode. This case is written
   * against the whole type rather than one column: the next column added
   * to TripItem is covered the day it is added.
   */
  it('an M5 edit preserves every other column of the row, provenance included', () => {
    const orch = newOrch()
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: 'ti1',
      deleted: false,
      row: {
        trip_id: 't1',
        source_item_id: 'mi1',
        source_template_id: 'grp1',
        name: 'Stativ',
        weight_grams: 1200,
        value_cents: 9900,
        category_name: 'Foto',
        quantity: 2,
        packed_count: 2,
        state: 'packed',
        mode: 'pack',
        late_packer: 1,
        assigned_traveler_id: 'trav-1',
        packer_user_id: 'u-1',
        packed_by_user_id: 'u-2',
        packed_at: '2026-08-19T10:00:00Z',
        container_id: 'cont-1',
        packing_now_by: 'u-3',
        packing_now_at: '2026-08-19T10:05:00Z',
        flag_unused: 0,
        flag_missing: 0,
      },
    })
    const before = { ...trips.getItems('t1')[0]! }
    mockDrain()

    orch.setReviewFlag('t1', trips.getItems('t1')[0]!, 'unused', true)

    const after = trips.getItems('t1')[0]!
    expect(after).toEqual({ ...before, flag_unused: true, updated_hlc: after.updated_hlc })
  })

  it('setReviewFlag marks an item unused without disturbing its packing record', () => {
    const orch = newOrch()
    const trips = seedRow()
    mockDrain()

    orch.setReviewFlag('t1', trips.getItems('t1')[0]!, 'unused', true)

    const item = trips.getItems('t1')[0]!
    expect(item.flag_unused).toBe(true)
    expect(item.flag_missing).toBe(false)
    expect(item.state).toBe('packed')
    expect(item.packed_count).toBe(1)
  })

  it('setReviewFlag clears a flag again — a wrong judgement is not permanent', () => {
    const orch = newOrch()
    const trips = seedRow()
    mockDrain()
    mockDrain()

    orch.setReviewFlag('t1', trips.getItems('t1')[0]!, 'missing', true)
    expect(trips.getItems('t1')[0]!.flag_missing).toBe(true)

    orch.setReviewFlag('t1', trips.getItems('t1')[0]!, 'missing', false)
    expect(trips.getItems('t1')[0]!.flag_missing).toBe(false)
  })
})
