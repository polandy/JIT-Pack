/**
 * M11 container CRUD (FR-10.1): full-row mutations on the trip
 * partition; deleting a container unassigns its items first — the DB
 * has a plain FK from trip_items.container_id, so a dangling reference
 * would reject the delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useMutations } from '@/composables/useMutations'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { HLCGenerator } from '@/sync/hlc'
import { useTripStore } from '@/stores/tripStore'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ results: [], pull_hint: { next_cursor: 1 } }), { status: 200 },
  )))
  vi.stubGlobal('WebSocket', vi.fn())
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

describe('container mutations', () => {
  const mutations = useMutations(new HLCGenerator(() => Date.now(), 'aabbccdd'))

  it('addContainer builds a complete containers insert', () => {
    const { mutation } = mutations.addContainer('t1', 'Left Pannier', {
      carrierTravelerId: 'trav-1',
      maxWeightGrams: 12000,
    })

    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('containers')
    expect(mutation.fields).toMatchObject({
      trip_id: 't1',
      name: 'Left Pannier',
      carrier_traveler_id: 'trav-1',
      max_weight_grams: 12000,
      paired_container_id: null,
    })
  })

  it('updateContainer carries only the changed fields', () => {
    const mutation = mutations.updateContainer('c1', { paired_container_id: 'c2' })

    expect(mutation.op).toBe('upsert')
    expect(mutation.fields).toEqual({ paired_container_id: 'c2' })
  })
})

describe('orchestrator container actions', () => {
  it('creates, updates, and pairs containers optimistically', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()

    const id = orch.addContainer('t1', 'Left Pannier', { maxWeightGrams: 12000 })
    const pairId = orch.addContainer('t1', 'Right Pannier', {})
    expect(store.getContainers('t1')).toHaveLength(2)

    orch.updateContainer('t1', store.getContainers('t1')[0], { paired_container_id: pairId })
    const updated = store.getContainers('t1').find((c) => c.id === id)
    expect(updated?.paired_container_id).toBe(pairId)
    expect(updated?.max_weight_grams).toBe(12000)
  })

  it('deleteContainer unassigns its items before deleting (FK order)', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()
    const containerId = orch.addContainer('t1', 'Roof Box', {})
    store.applyChange({
      seq: 0, table: 'trip_items', id: 'ti1', deleted: false,
      row: { trip_id: 't1', name: 'Zelt', quantity: 1, packed_count: 0, state: 'open', mode: 'pack', container_id: containerId },
    })

    orch.deleteContainer('t1', containerId)

    expect(store.getContainers('t1')).toHaveLength(0)
    expect(store.getItems('t1')[0].container_id).toBeNull()

    // Both mutations land in one push batch: unassign before delete.
    interface WireMutation { table: string; op: string }
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      const batch = deleteBatch(fetchMock)
      expect(batch).not.toBeNull()
    })
    const batch = deleteBatch(fetchMock)!
    const unassignIdx = batch.findIndex((m) => m.table === 'trip_items' && m.op === 'upsert')
    const deleteIdx = batch.findIndex((m) => m.table === 'containers' && m.op === 'delete')
    expect(unassignIdx).toBeGreaterThanOrEqual(0)
    expect(deleteIdx).toBeGreaterThan(unassignIdx)

    function deleteBatch(mock: ReturnType<typeof vi.fn>): WireMutation[] | null {
      for (const call of mock.mock.calls) {
        const init = call[1] as RequestInit | undefined
        if (!init?.body) continue
        const parsed = JSON.parse(String(init.body)) as { mutations?: WireMutation[] }
        if (parsed.mutations?.some((m) => m.table === 'containers' && m.op === 'delete')) {
          return parsed.mutations
        }
      }
      return null
    }
  })
})
