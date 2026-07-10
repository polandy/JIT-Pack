/**
 * M15 commitImport (FR-16.2): the plan lands as ordinary mutations —
 * categories and master items (merged where decided) on the master
 * partition, archived `imported` trips with packed original quantities
 * on their trip partitions, '?' noise as open tasks (NFR-4.7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ImportPlan } from '@/domain/spreadsheet'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ results: [], pull_hint: { next_cursor: 1 }, changes: [], next_cursor: 1, has_more: false }),
    { status: 200 },
  ))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', vi.fn())
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

const plan: ImportPlan = {
  newCategories: ['Kleidung'],
  items: [
    { name: 'Unterhosen', categoryName: 'Kleidung', existingItemId: 'i-exist', hasOpenTask: false },
    { name: 'Socken', categoryName: 'Kleidung', existingItemId: null, hasOpenTask: false },
    { name: 'Regenschutz Rucksack', categoryName: null, existingItemId: null, hasOpenTask: true },
  ],
  trips: [
    {
      name: 'Engadin 2023', endDate: '2023-12-31', seriesId: null,
      items: [
        { itemIndex: 0, quantity: 5 },
        { itemIndex: 2, quantity: 1 },
      ],
    },
    {
      name: 'Engadin 2025', endDate: '2025-12-31', seriesId: 'ser-1',
      items: [{ itemIndex: 1, quantity: 6 }],
    },
  ],
}

describe('commitImport (FR-16.2)', () => {
  it('creates categories, merges decided items, and imports archived trips', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const master = useMasterStore()
    const trips = useTripStore()
    master.applyChange({
      seq: 0, table: 'items', id: 'i-exist', deleted: false,
      row: { name: 'Unterhosen', unit: 'pieces', is_consumable: 0 },
    })

    const result = orch.commitImport(plan)

    // Master data: one new category, two new items, merge reused.
    const kleidung = master.categoryList.find((c) => c.name === 'Kleidung')
    expect(kleidung).toBeDefined()
    expect(master.itemList.map((i) => i.name).sort()).toEqual(
      ['Regenschutz Rucksack', 'Socken', 'Unterhosen'],
    )
    expect(master.itemList.find((i) => i.name === 'Socken')?.category_id).toBe(kleidung!.id)

    // Trips: archived, imported, original quantities as packed.
    expect(result.tripIds).toHaveLength(2)
    const t2023 = trips.getTrip(result.tripIds[0]!)!
    expect(t2023).toMatchObject({ name: 'Engadin 2023', status: 'archived', imported: true })
    const items2023 = trips.getItems(t2023.id)
    const unterhosen = items2023.find((i) => i.name === 'Unterhosen')!
    expect(unterhosen).toMatchObject({
      quantity: 5, packed_count: 5, state: 'packed', source_item_id: 'i-exist',
    })

    const t2025 = trips.getTrip(result.tripIds[1]!)!
    expect(t2025.series_id).toBe('ser-1')
    expect(trips.getItems(t2025.id)[0]).toMatchObject({ name: 'Socken', quantity: 6 })

    // '?' noise → open task on the imported trip item (NFR-4.7).
    const regen = items2023.find((i) => i.name === 'Regenschutz Rucksack')!
    const todos = trips.getItemTodos(t2023.id, regen.id)
    expect(todos).toHaveLength(1)
    expect(todos[0]!.task_state).toBe('open')
  })

  it('reuses an existing category instead of duplicating it', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const master = useMasterStore()
    master.applyChange({
      seq: 0, table: 'categories', id: 'cat-1', deleted: false,
      row: { name: 'Kleidung', sort_order: 0 },
    })

    orch.commitImport({ ...plan, trips: [] })

    expect(master.categoryList.filter((c) => c.name === 'Kleidung')).toHaveLength(1)
    expect(master.itemList.find((i) => i.name === 'Socken')?.category_id).toBe('cat-1')
  })
})
