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
      row: { name: 'Socken', unit: 'pieces', weight_grams: 80 },
    })
    mockDrain()

    orch.updateMasterItem(master.getItem('i1')!, { weight_grams: 500 })

    const item = master.getItem('i1')!
    expect(item.weight_grams).toBe(500)
    expect(item.name).toBe('Socken')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/sync/master')
  })

  it('template item lifecycle: add, update preserving fields, delete', () => {
    const orch = newOrch()
    const master = useMasterStore()
    mockDrain()
    mockDrain()
    mockDrain()

    const tiId = orch.addTemplateItem('tpl-1', 'i1', { quantityFormula: 'num_travelers' })
    expect(master.getTemplateItems('tpl-1')).toHaveLength(1)

    orch.updateTemplateItem(master.getTemplateItems('tpl-1')[0]!, { dedup: 'sum' })
    const ti = master.getTemplateItems('tpl-1')[0]!
    expect(ti.dedup).toBe('sum')
    expect(ti.quantity_formula).toBe('num_travelers')

    orch.deleteTemplateItem(tiId)
    expect(master.getTemplateItems('tpl-1')).toHaveLength(0)
  })

  it('createMasterItem and deleteMasterItem round-trip the store', () => {
    const orch = newOrch()
    const master = useMasterStore()
    mockDrain()
    mockDrain()

    const id = orch.createMasterItem('Stirnlampe', { unit: 'pieces' })
    expect(master.getItem(id)?.name).toBe('Stirnlampe')

    orch.deleteMasterItem(id)
    expect(master.getItem(id)).toBeUndefined()
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
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/sync/trips/t1')
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
