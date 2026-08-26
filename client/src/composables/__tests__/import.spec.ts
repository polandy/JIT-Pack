/**
 * M15 commitImport (FR-16.2): the plan lands as ordinary mutations —
 * categories and master items (merged where decided) on the master
 * partition, archived `imported` trips with packed original quantities
 * on their trip partitions, '?' noise as open tasks (NFR-4.7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ImportPlan } from '@/domain/spreadsheet'
import { installHarness } from '@/__tests__/harness'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  const harness = installHarness()
  fetchMock = harness.fetch
  harness.mockDrain()
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
      name: 'Engadin 2023',
      year: 2023,
      endDate: '2023-12-31',
      seriesId: null,
      items: [
        { itemIndex: 0, quantity: 5 },
        { itemIndex: 2, quantity: 1 },
      ],
    },
    {
      name: 'Engadin 2025',
      year: 2025,
      endDate: '2025-12-31',
      seriesId: 'ser-1',
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
      seq: 0,
      table: 'items',
      id: 'i-exist',
      deleted: false,
      row: { name: 'Unterhosen' },
    })

    const result = orch.commitImport(plan)

    // Master data: one new category, two new items, merge reused.
    const kleidung = master.tagList.find((c) => c.name === 'Kleidung')
    expect(kleidung).toBeDefined()
    expect(master.itemList.map((i) => i.name).sort()).toEqual([
      'Regenschutz Rucksack',
      'Socken',
      'Unterhosen',
    ])
    // The spreadsheet's category column becomes the item's primary tag.
    const socken = master.itemList.find((i) => i.name === 'Socken')!
    expect(master.getPrimaryTag(socken.id)?.id).toBe(kleidung!.id)

    // Trips: archived, imported, original quantities as packed.
    expect(result.tripIds).toHaveLength(2)
    const t2023 = trips.getTrip(result.tripIds[0]!)!
    // FR-2.1b: `trips.year` is NOT NULL, so an imported trip that omits it
    // is refused by the server and the whole migration lands nowhere.
    expect(t2023).toMatchObject({
      name: 'Engadin 2023',
      year: 2023,
      status: 'archived',
      imported: true,
    })
    const items2023 = trips.getItems(t2023.id)
    const unterhosen = items2023.find((i) => i.name === 'Unterhosen')!
    expect(unterhosen).toMatchObject({
      quantity: 5,
      packed_count: 5,
      state: 'packed',
      source_item_id: 'i-exist',
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

  /**
   * The wire order, not the store's. A tag assignment points at an item by
   * foreign key, so a server applying the batch in order refuses every one of
   * them when the link is enqueued before the row it links to — and nothing on
   * the importing device can tell, because its own store took both
   * optimistically. The whole inventory arrived untagged (found 2026-08-23 by
   * importing into the real instance on :3000).
   */
  it('enqueues every master item before the tag assignment that references it', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    orch.commitImport(plan)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const pushed = fetchMock.mock.calls
      .map(([, init]) => init?.body)
      .filter((b): b is string => typeof b === 'string')
      .flatMap((b) => JSON.parse(b).mutations ?? [])

    const seenItems = new Set<string>()
    const orphans: string[] = []
    for (const m of pushed) {
      if (m.table === 'items') seenItems.add(m.id)
      else if (m.table === 'item_tags' && !seenItems.has(m.fields.item_id)) {
        orphans.push(m.fields.item_id)
      }
    }

    expect(orphans, 'item_tags pushed before the items they name').toEqual([])
    // A positive signal: the assertion above is vacuous if nothing was pushed.
    expect(pushed.filter((m) => m.table === 'item_tags').length).toBeGreaterThan(0)
  })

  it('reuses an existing category instead of duplicating it', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const master = useMasterStore()
    master.applyChange({
      seq: 0,
      table: 'tags',
      id: 'cat-1',
      deleted: false,
      row: { name: 'Kleidung', sort_order: 0 },
    })

    orch.commitImport({ ...plan, trips: [] })

    expect(master.tagList.filter((c) => c.name === 'Kleidung')).toHaveLength(1)
    const socken2 = master.itemList.find((i) => i.name === 'Socken')!
    expect(master.getPrimaryTag(socken2.id)?.id).toBe('cat-1')
  })
})
