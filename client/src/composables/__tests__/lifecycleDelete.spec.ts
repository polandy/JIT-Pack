/**
 * FR-24.3 — a delete is one of two acts, and the client has to pick the
 * right one before the user confirms and mirror it optimistically after.
 *
 * The direction that matters is asymmetric: a retired row appearing in a
 * picker is noise, while a retired row *missing* from resolution, export or
 * the NFR-4.11 backup is data loss. The last three cases here are the ones
 * that exist to fail if `itemList`/`templateList` ever start filtering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { DELETION_REMOVE, DELETION_RETIRE } from '@/domain/masterDeletion'
import type { PushResponse } from '@/api/types'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
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

function mockDrain() {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ results: [], pull_hint: { next_cursor: 1 } } satisfies PushResponse),
      { status: 200 },
    ),
  )
}

function newOrch() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

/** An item held by one group position — the FR-24.3 "ever referenced" case. */
function seedReferencedItem() {
  const master = useMasterStore()
  master.applyChange({
    seq: 0,
    table: 'items',
    id: 'it-1',
    deleted: false,
    row: { name: 'Kamera' },
  })
  master.applyChange({
    seq: 0,
    table: 'templates',
    id: 'tpl-1',
    deleted: false,
    row: { name: 'Fotografie', kind: 'group', owner_id: 'u' },
  })
  master.applyChange({
    seq: 0,
    table: 'template_items',
    id: 'pos-1',
    deleted: false,
    row: { template_id: 'tpl-1', item_id: 'it-1', quantity: 1 },
  })
  return master
}

describe('FR-24.3 — deleting a master item', () => {
  it('retires an item a group position holds, instead of removing it', async () => {
    const orch = newOrch()
    const master = seedReferencedItem()
    mockDrain()

    expect(orch.masterItemDeletionOutlook('it-1')).toMatchObject({
      kind: DELETION_RETIRE,
      references: 1,
      certain: true,
    })

    orch.deleteMasterItem('it-1')

    // The positive signal beside the "did not disappear" assertion: the row
    // is still in the store, and it carries the marker that hides it.
    expect(master.getItem('it-1')?.name).toBe('Kamera')
    expect(master.getItem('it-1')?.retired_at).toBeTruthy()
    expect(master.activeItemList.map((i) => i.id)).not.toContain('it-1')
    expect(master.itemList.map((i) => i.id)).toContain('it-1')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))
    expect(body.mutations[0].op).toBe('upsert')
    expect(body.mutations[0].fields.retired_at).toBeTruthy()
  })

  it('removes an item nothing has ever used', async () => {
    const orch = newOrch()
    const master = useMasterStore()
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'it-lonely',
      deleted: false,
      row: { name: 'Vertipper' },
    })
    mockDrain()

    expect(orch.masterItemDeletionOutlook('it-lonely').kind).toBe(DELETION_REMOVE)

    orch.deleteMasterItem('it-lonely')

    expect(master.getItem('it-lonely')).toBeUndefined()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).mutations[0].op).toBe('delete')
  })

  it('counts a trip row generated from the item, not only group positions', () => {
    const orch = newOrch()
    const master = useMasterStore()
    const trips = useTripStore()
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'it-2',
      deleted: false,
      row: { name: 'Zelt' },
    })
    trips.applyChange({
      seq: 0,
      table: 'trips',
      id: 'trip-1',
      deleted: false,
      row: { name: 'Engadin', year: 2026, status: 'archived' },
    })
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: 'ti-1',
      deleted: false,
      row: { trip_id: 'trip-1', name: 'Zelt', quantity: 1, source_item_id: 'it-2' },
    })

    expect(orch.masterItemDeletionOutlook('it-2')).toMatchObject({
      kind: DELETION_RETIRE,
      references: 1,
    })
  })

  it('cannot be certain of a physical delete while trips are still unseen (Server Mode)', () => {
    const orch = newOrch()
    const master = useMasterStore()
    master.applyChange({ seq: 0, table: 'items', id: 'it-3', deleted: false, row: { name: 'Hut' } })

    // No reference here — but this device holds only the trip partitions it
    // has opened, so the sentence M10 shows has to say so (ADR-032).
    expect(orch.masterItemDeletionOutlook('it-3')).toMatchObject({
      kind: DELETION_REMOVE,
      certain: false,
    })
  })
})

describe('FR-24.3 — deleting a Vorlage', () => {
  it('retires a group a trip was generated from (FR-9.2)', async () => {
    const orch = newOrch()
    const master = seedReferencedItem()
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trips',
      id: 'trip-1',
      deleted: false,
      row: { name: 'Engadin', year: 2026, status: 'archived' },
    })
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: 'ti-1',
      deleted: false,
      row: { trip_id: 'trip-1', name: 'Kamera', quantity: 1, source_template_id: 'tpl-1' },
    })
    mockDrain()

    expect(orch.templateDeletionOutlook('tpl-1').kind).toBe(DELETION_RETIRE)

    orch.deleteTemplate('tpl-1')

    expect(master.getTemplate('tpl-1')?.retired_at).toBeTruthy()
    // The cascade the store mirrors on a real delete must not have run.
    expect(master.getTemplateItems('tpl-1').map((p) => p.id)).toEqual(['pos-1'])
    expect(master.activeTemplateList.map((t) => t.id)).not.toContain('tpl-1')
  })

  it('removes a group no trip ever used', () => {
    const orch = newOrch()
    const master = seedReferencedItem()
    mockDrain()

    expect(orch.templateDeletionOutlook('tpl-1').kind).toBe(DELETION_REMOVE)

    orch.deleteTemplate('tpl-1')

    expect(master.getTemplate('tpl-1')).toBeUndefined()
  })
})

describe('FR-24.3 — what the marker must never hide', () => {
  it('resolves a Vorlage through a retired group, with its retired items', () => {
    const orch = newOrch()
    const master = seedReferencedItem()
    master.applyChange({
      seq: 0,
      table: 'templates',
      id: 'tpl-ferien',
      deleted: false,
      row: { name: 'Ferien', kind: 'template', owner_id: 'u' },
    })
    master.applyChange({
      seq: 0,
      table: 'template_includes',
      id: 'inc-1',
      deleted: false,
      row: { template_id: 'tpl-ferien', included_template_id: 'tpl-1' },
    })
    mockDrain()

    const before = master.resolve('tpl-ferien').positions.length
    expect(before).toBe(1)

    orch.deleteMasterItem('it-1')

    // A generated trip would lose an item if resolution filtered.
    expect(master.resolve('tpl-ferien').positions.length).toBe(before)
    expect(master.getItem('it-1')?.name).toBe('Kamera')
  })

  it('keeps a retired template in the composition source the backup writes', () => {
    const orch = newOrch()
    const master = seedReferencedItem()
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trips',
      id: 'trip-1',
      deleted: false,
      row: { name: 'Engadin', year: 2026, status: 'archived' },
    })
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: 'ti-1',
      deleted: false,
      row: { trip_id: 'trip-1', name: 'Kamera', quantity: 1, source_template_id: 'tpl-1' },
    })
    mockDrain()

    orch.deleteTemplate('tpl-1')

    // NFR-4.11: the backup is the only copy a Local Mode device has.
    expect(master.compositionSource().templates.map((t) => t.id)).toContain('tpl-1')
    expect(master.portableResolvers().masterItem('it-1')?.name).toBe('Kamera')
  })
})
