import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import type { PullResponse, PushResponse } from '@/api/types'
import { installHarness } from '@/__tests__/harness'

// Mock fetch globally
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;({ fetch: fetchMock } = installHarness())
})

function mockPush(results: PushResponse['results'] = []) {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ results, pull_hint: { next_cursor: 1 } } satisfies PushResponse),
      { status: 200 },
    ),
  )
}

function mockPull(changes: PullResponse['changes'] = []) {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ changes, next_cursor: 1, has_more: false } satisfies PullResponse),
      { status: 200 },
    ),
  )
}

describe('useSyncOrchestrator', () => {
  it('quickAddItem adds item optimistically to trip store', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    // Mock the drain (push + pull)
    mockPush()
    mockPull()

    orch.quickAddItem('t1', 'Towel', {}, false)

    const items = tripStore.getItems('t1')
    expect(items).toHaveLength(1)
    expect(items[0]!.name).toBe('Towel')
    expect(items[0]!.state).toBe('open')
  })

  it('quickAddItem flags missing on active trips', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    mockPush()
    mockPull()

    orch.quickAddItem('t1', 'Sunscreen', {}, true)

    expect(tripStore.getItems('t1')[0]!.flag_missing).toBe(true)
  })

  /**
   * FR-25.11j through the optimistic write. Every trip-item mutation rebuilds
   * the row from `itemRow(item)` plus the fields it changes, so a column
   * missing there is silently dropped by the *next unrelated* action on that
   * row — the shape #158 paid for, where the optimistic row was only the
   * form. A purchase that survives being bought and then vanishes when
   * somebody packs it is the same defect with a longer fuse.
   */
  it('an unrelated mutation on a bought row keeps its bought_from (FR-25.11j)', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    tripStore.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Kaffee',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
        bought_from: 'buy_before',
        updated_hlc: '',
      },
    })

    mockPush()
    mockPull()

    orch.packComplete('t1', tripStore.getItems('t1')[0]!)

    const row = tripStore.getItems('t1')[0]!
    expect(row.state).toBe('packed')
    expect(row.bought_from).toBe('buy_before')
  })

  it('buyItem records the list and moves the row off it, in one write (FR-25.11j)', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    tripStore.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Kaffee',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'buy_before',
        updated_hlc: '',
      },
    })

    mockPush()
    mockPull()
    orch.buyItem('t1', tripStore.getItems('t1')[0]!, 'buy_before')

    expect(tripStore.getItems('t1')[0]!.mode).toBe('pack')
    expect(tripStore.getItems('t1')[0]!.bought_from).toBe('buy_before')

    mockPush()
    mockPull()
    orch.unbuyItem('t1', tripStore.getItems('t1')[0]!, 'buy_before')

    expect(tripStore.getItems('t1')[0]!.mode).toBe('buy_before')
    expect(tripStore.getItems('t1')[0]!.bought_from).toBeNull()
  })

  it('packToggle flips item between open and packed', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    // Seed an item
    tripStore.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Hat',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
        updated_hlc: '',
      },
    })

    mockPush()
    mockPull()

    const item = tripStore.getItems('t1')[0]!
    orch.packToggle('t1', item)

    expect(tripStore.getItems('t1')[0]!.packed_count).toBe(1)
    expect(tripStore.getItems('t1')[0]!.state).toBe('packed')
  })

  // The rule every optimistic update rests on: the store *replaces* the row
  // it is given, so an action that mentions two columns must still hand back
  // the other six. In Local Mode no pull ever arrives to heal them, which is
  // why the test asserts what the action did *not* change.
  it('keeps the columns its mutation never mentions', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    tripStore.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Regenjacke',
        quantity: 3,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
        category_name: 'Kleidung',
        late_packer: 1,
        updated_hlc: '',
      },
    })

    orch.packIncrement('t1', tripStore.getItems('t1')[0]!)

    const item = tripStore.getItems('t1')[0]!
    expect(item.packed_count).toBe(1)
    expect(item.name).toBe('Regenjacke')
    expect(item.quantity).toBe(3)
    expect(item.mode).toBe('pack')
    expect(item.category_name).toBe('Kleidung')
    expect(item.late_packer).toBe(true)
  })

  it('skipItem sets state to skipped optimistically', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    tripStore.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Umbrella',
        quantity: 2,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
        updated_hlc: '',
      },
    })

    mockPush()
    mockPull()

    const item = tripStore.getItems('t1')[0]!
    orch.skipItem('t1', item)

    const updated = tripStore.getItems('t1')[0]!
    expect(updated.state).toBe('skipped')
    expect(updated.quantity).toBe(0)
  })

  it('unskipItem restores to open', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    tripStore.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Umbrella',
        quantity: 0,
        packed_count: 0,
        state: 'skipped',
        mode: 'pack',
        updated_hlc: '',
      },
    })

    mockPush()
    mockPull()

    const item = tripStore.getItems('t1')[0]!
    orch.unskipItem('t1', item)

    const updated = tripStore.getItems('t1')[0]!
    expect(updated.state).toBe('open')
    expect(updated.quantity).toBe(1)
  })

  it('drainTrip updates sync status', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    mockPull([
      {
        seq: 1,
        table: 'trips',
        id: 't1',
        deleted: false,
        row: { name: 'Test', status: 'active', start_date: '2026-08-01', end_date: '2026-08-05' },
      },
    ])

    await orch.drainTrip('t1')

    const tripStore = useTripStore()
    expect(tripStore.getTrip('t1')?.name).toBe('Test')
    expect(orch.syncStatus.state.value).toBe('synced')
  })

  it('drainMaster routes changes to master store', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    mockPull([
      {
        seq: 1,
        table: 'tags',
        id: 'c1',
        deleted: false,
        row: { name: 'Clothes', sort_order: 0 },
      },
      {
        seq: 2,
        table: 'items',
        id: 'i1',
        deleted: false,
        row: { name: 'Shirt', category_id: 'c1' },
      },
    ])

    await orch.drainMaster()

    const masterStore = useMasterStore()
    expect(masterStore.tagList).toHaveLength(1)
    expect(masterStore.getItem('i1')?.name).toBe('Shirt')
  })

  // FR-24.2: the primary tag is the one at position 0, so assigning three
  // tags in a row has to produce 0, 1, 2 — not three zeroes. It reads as
  // correct either way in a list (a stable sort keeps insertion order), which
  // is exactly why it needs asserting on the stored positions.
  it('assigns each tag the next position, so the primary one is decided data', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const masterStore = useMasterStore()

    const itemId = orch.createMasterItem('Badehose')
    const kleidung = orch.createTag('Kleidung')
    const sommer = orch.createTag('Sommer')
    const strand = orch.createTag('Strand')

    orch.assignTag(itemId, kleidung)
    orch.assignTag(itemId, sommer)
    orch.assignTag(itemId, strand)

    const positions = masterStore.itemTagList
      .filter((a) => a.item_id === itemId)
      .map((a) => a.position)
      .sort((a, b) => a - b)
    expect(positions).toEqual([0, 1, 2])

    // ...and the item therefore reads as filed under the first one.
    expect(masterStore.getPrimaryTag(itemId)?.name).toBe('Kleidung')
  })

  it('sets offline on network failure', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    fetchMock.mockRejectedValueOnce(new Error('network error'))

    await orch.drainTrip('t1')

    expect(orch.syncStatus.state.value).toBe('offline')
  })

  it('enqueues mutations and updates pending count', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    mockPush()
    mockPull()

    orch.quickAddItem('t1', 'A', {}, false)
    orch.quickAddItem('t1', 'B', {}, false)

    // Pending count is set (may be 0 if drain already completed, but totalPending was called)
    expect(orch.outbox.totalPending()).toBeGreaterThanOrEqual(0)
  })

  describe('container pairing (FR-10.3, M11)', () => {
    function seedContainers(orch: ReturnType<typeof useSyncOrchestrator>, names: string[]) {
      const ids: string[] = []
      for (const name of names) {
        mockPush()
        mockPull()
        ids.push(orch.addContainer('t1', name, {}))
      }
      return ids
    }

    it('pairContainer sets both sides at once', () => {
      const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
      const tripStore = useTripStore()
      const [a, b] = seedContainers(orch, ['Left', 'Right'])

      mockPush()
      mockPull()
      orch.pairContainer('t1', a!, b!)

      const byId = new Map(tripStore.getContainers('t1').map((c) => [c.id, c]))
      expect(byId.get(a!)!.paired_container_id).toBe(b)
      expect(byId.get(b!)!.paired_container_id).toBe(a)
    })

    it('pairContainer releases the previous partner when one side re-pairs', () => {
      const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
      const tripStore = useTripStore()
      const [a, b, c] = seedContainers(orch, ['Left', 'Right', 'Roof Box'])

      mockPush()
      mockPull()
      orch.pairContainer('t1', a!, b!)
      mockPush()
      mockPull()
      orch.pairContainer('t1', a!, c!)

      const byId = new Map(tripStore.getContainers('t1').map((x) => [x.id, x]))
      expect(byId.get(a!)!.paired_container_id).toBe(c)
      expect(byId.get(c!)!.paired_container_id).toBe(a)
      expect(byId.get(b!)!.paired_container_id).toBeNull()
    })

    it('unpairContainer clears both sides', () => {
      const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
      const tripStore = useTripStore()
      const [a, b] = seedContainers(orch, ['Left', 'Right'])

      mockPush()
      mockPull()
      orch.pairContainer('t1', a!, b!)
      mockPush()
      mockPull()
      orch.unpairContainer('t1', b!)

      for (const container of tripStore.getContainers('t1')) {
        expect(container.paired_container_id).toBeNull()
      }
    })

    it('deleteContainer releases the surviving partner', () => {
      const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
      const tripStore = useTripStore()
      const [a, b] = seedContainers(orch, ['Left', 'Right'])

      mockPush()
      mockPull()
      orch.pairContainer('t1', a!, b!)
      mockPush()
      mockPull()
      orch.deleteContainer('t1', a!)

      const survivors = tripStore.getContainers('t1')
      expect(survivors.map((x) => x.id)).toEqual([b])
      expect(survivors[0]!.paired_container_id).toBeNull()
    })

    it('deleteContainer unassigns the container’s items instead of removing them', () => {
      const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
      const tripStore = useTripStore()
      const [a] = seedContainers(orch, ['Duffel'])

      mockPush()
      mockPull()
      orch.quickAddItem('t1', 'Towel', {}, false)
      const item = tripStore.getItems('t1')[0]!
      mockPush()
      mockPull()
      orch.assignContainer('t1', item, a!)

      mockPush()
      mockPull()
      orch.deleteContainer('t1', a!)

      const after = tripStore.getItems('t1')
      expect(after).toHaveLength(1)
      expect(after[0]!.container_id).toBeNull()
    })
  })
})
