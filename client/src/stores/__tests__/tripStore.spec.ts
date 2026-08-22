import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTripStore } from '../tripStore'
import type { PullChange } from '@/api/types'
import type { Trip } from '@/types/domain'
import { TABLE } from '@/types/tables'

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    name: 'Beach Trip',
    status: 'active',
    year: 2026,
    start_date: '2026-07-10',
    end_date: '2026-07-15',
    duration_days: 6,
    series_id: null,
    series_name: null,
    attributes: null,
    imported: false,
    ...overrides,
  }
}

describe('tripStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts empty', () => {
    const store = useTripStore()
    expect(store.tripList).toEqual([])
    expect(store.getItems('t1')).toEqual([])
  })

  it('sets and retrieves a trip', () => {
    const store = useTripStore()
    store.setTrip(makeTrip())
    expect(store.getTrip('t1')?.name).toBe('Beach Trip')
    expect(store.tripList).toHaveLength(1)
  })

  it('removes a trip and its items', () => {
    const store = useTripStore()
    store.setTrip(makeTrip())
    store.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Towel',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
      },
    })
    expect(store.getItems('t1')).toHaveLength(1)

    store.removeTrip('t1')
    expect(store.getTrip('t1')).toBeUndefined()
    expect(store.getItems('t1')).toEqual([])
  })

  it('applies trip pull change', () => {
    const store = useTripStore()
    const change: PullChange = {
      seq: 1,
      table: 'trips',
      id: 't1',
      deleted: false,
      row: {
        name: 'Ski Trip',
        status: 'planning',
        year: 2026,
        start_date: '2027-01-10',
        end_date: '2027-01-15',
        duration_days: 6,
      },
    }
    store.applyChange(change)
    expect(store.getTrip('t1')?.name).toBe('Ski Trip')
    expect(store.getTrip('t1')?.status).toBe('planning')
  })

  it('applies trip deletion', () => {
    const store = useTripStore()
    store.setTrip(makeTrip())
    store.applyChange({ seq: 2, table: 'trips', id: 't1', deleted: true, row: null })
    expect(store.getTrip('t1')).toBeUndefined()
  })

  it('applies trip_items pull changes', () => {
    const store = useTripStore()
    store.applyChanges([
      {
        seq: 1,
        table: 'trip_items',
        id: 'i1',
        deleted: false,
        row: {
          trip_id: 't1',
          name: 'Towel',
          quantity: 3,
          packed_count: 1,
          state: 'partial',
          mode: 'pack',
          weight_grams: 500,
          value_cents: 2000,
          category_name: 'Bath',
          updated_hlc: 'h1',
        },
      },
      {
        seq: 2,
        table: 'trip_items',
        id: 'i2',
        deleted: false,
        row: {
          trip_id: 't1',
          name: 'Soap',
          quantity: 1,
          packed_count: 0,
          state: 'open',
          mode: 'buy_before',
          updated_hlc: 'h2',
        },
      },
    ])

    const items = store.getItems('t1')
    expect(items).toHaveLength(2)
    expect(items[0]!.name).toBe('Towel')
    expect(items[0]!.packed_count).toBe(1)
  })

  it('upserts existing trip item', () => {
    const store = useTripStore()
    store.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Towel',
        quantity: 3,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
        updated_hlc: 'h1',
      },
    })
    store.applyChange({
      seq: 2,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Towel',
        quantity: 3,
        packed_count: 2,
        state: 'partial',
        mode: 'pack',
        updated_hlc: 'h2',
      },
    })

    const items = store.getItems('t1')
    expect(items).toHaveLength(1)
    expect(items[0]!.packed_count).toBe(2)
  })

  it('deletes trip item', () => {
    const store = useTripStore()
    store.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Towel',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
        updated_hlc: 'h1',
      },
    })
    store.applyChange({ seq: 2, table: 'trip_items', id: 'i1', deleted: true, row: null })
    expect(store.getItems('t1')).toHaveLength(0)
  })

  it('computes KPIs', () => {
    const store = useTripStore()
    store.applyChanges([
      {
        seq: 1,
        table: 'trip_items',
        id: 'i1',
        deleted: false,
        row: {
          trip_id: 't1',
          name: 'A',
          quantity: 2,
          packed_count: 1,
          weight_grams: 100,
          value_cents: 500,
          state: 'partial',
          mode: 'pack',
          updated_hlc: 'h1',
        },
      },
      {
        seq: 2,
        table: 'trip_items',
        id: 'i2',
        deleted: false,
        row: {
          trip_id: 't1',
          name: 'B',
          quantity: 3,
          packed_count: 3,
          weight_grams: 200,
          value_cents: 1000,
          state: 'packed',
          mode: 'pack',
          updated_hlc: 'h2',
        },
      },
    ])

    const k = store.kpis('t1')
    expect(k.totalItems).toBe(5) // 2 + 3
    expect(k.packedItems).toBe(4) // 1 + 3
    expect(k.totalWeight).toBe(800) // 100*2 + 200*3
    expect(k.packedWeight).toBe(700) // 100*1 + 200*3
    expect(k.totalValue).toBe(4000) // 500*2 + 1000*3
    expect(k.packedValue).toBe(3500) // 500*1 + 1000*3
  })

  it('handles travelers', () => {
    const store = useTripStore()
    store.applyChange({
      seq: 1,
      table: 'travelers',
      id: 'tv1',
      deleted: false,
      row: { trip_id: 't1', name: 'Alice' },
    })
    expect(store.getTravelers('t1')).toHaveLength(1)
    expect(store.getTravelers('t1')[0]!.name).toBe('Alice')

    store.applyChange({ seq: 2, table: 'travelers', id: 'tv1', deleted: true, row: null })
    expect(store.getTravelers('t1')).toHaveLength(0)
  })

  it('handles containers', () => {
    const store = useTripStore()
    store.applyChange({
      seq: 1,
      table: 'containers',
      id: 'c1',
      deleted: false,
      row: { trip_id: 't1', name: 'Suitcase', max_weight_grams: 23000 },
    })
    expect(store.getContainers('t1')).toHaveLength(1)

    store.applyChange({ seq: 2, table: 'containers', id: 'c1', deleted: true, row: null })
    expect(store.getContainers('t1')).toHaveLength(0)
  })

  // --- Preparation Todos (FR-7.3) ---

  it('applies comment with is_task as todo', () => {
    const store = useTripStore()
    store.applyChange({
      seq: 1,
      table: 'comments',
      id: 'todo1',
      deleted: false,
      row: {
        trip_id: 't1',
        trip_item_id: 'i1',
        author_id: 'u1',
        body: 'Charge battery',
        is_task: 1,
        task_state: 'open',
      },
    })
    expect(store.getTodos('t1')).toHaveLength(1)
    expect(store.getTodos('t1')[0]!.body).toBe('Charge battery')
    expect(store.getTodos('t1')[0]!.task_state).toBe('open')
  })

  it('ignores non-task comments', () => {
    const store = useTripStore()
    store.applyChange({
      seq: 1,
      table: 'comments',
      id: 'c1',
      deleted: false,
      row: {
        trip_id: 't1',
        trip_item_id: 'i1',
        author_id: 'u1',
        body: 'just a comment',
        is_task: 0,
        task_state: null,
      },
    })
    expect(store.getTodos('t1')).toHaveLength(0)
  })

  it('upserts existing todo (resolve)', () => {
    const store = useTripStore()
    store.applyChange({
      seq: 1,
      table: 'comments',
      id: 'todo1',
      deleted: false,
      row: {
        trip_id: 't1',
        trip_item_id: 'i1',
        author_id: 'u1',
        body: 'Charge battery',
        is_task: 1,
        task_state: 'open',
      },
    })
    store.applyChange({
      seq: 2,
      table: 'comments',
      id: 'todo1',
      deleted: false,
      row: {
        trip_id: 't1',
        trip_item_id: 'i1',
        author_id: 'u1',
        body: 'Charge battery',
        is_task: 1,
        task_state: 'resolved',
      },
    })
    expect(store.getTodos('t1')).toHaveLength(1)
    expect(store.getTodos('t1')[0]!.task_state).toBe('resolved')
  })

  it('deletes a todo', () => {
    const store = useTripStore()
    store.applyChange({
      seq: 1,
      table: 'comments',
      id: 'todo1',
      deleted: false,
      row: {
        trip_id: 't1',
        trip_item_id: 'i1',
        author_id: 'u1',
        body: 'Charge battery',
        is_task: 1,
        task_state: 'open',
      },
    })
    store.applyChange({ seq: 2, table: 'comments', id: 'todo1', deleted: true, row: null })
    expect(store.getTodos('t1')).toHaveLength(0)
  })

  it('getItemTodos filters by trip item', () => {
    const store = useTripStore()
    store.applyChanges([
      {
        seq: 1,
        table: 'comments',
        id: 'todo1',
        deleted: false,
        row: {
          trip_id: 't1',
          trip_item_id: 'i1',
          author_id: 'u1',
          body: 'Task A',
          is_task: 1,
          task_state: 'open',
        },
      },
      {
        seq: 2,
        table: 'comments',
        id: 'todo2',
        deleted: false,
        row: {
          trip_id: 't1',
          trip_item_id: 'i2',
          author_id: 'u1',
          body: 'Task B',
          is_task: 1,
          task_state: 'open',
        },
      },
      {
        seq: 3,
        table: 'comments',
        id: 'todo3',
        deleted: false,
        row: {
          trip_id: 't1',
          trip_item_id: 'i1',
          author_id: 'u1',
          body: 'Task C',
          is_task: 1,
          task_state: 'resolved',
        },
      },
    ])
    expect(store.getItemTodos('t1', 'i1')).toHaveLength(2)
    expect(store.getItemTodos('t1', 'i2')).toHaveLength(1)
  })

  it('getOpenTodos returns only open todos', () => {
    const store = useTripStore()
    store.applyChanges([
      {
        seq: 1,
        table: 'comments',
        id: 'todo1',
        deleted: false,
        row: {
          trip_id: 't1',
          trip_item_id: 'i1',
          author_id: 'u1',
          body: 'Open',
          is_task: 1,
          task_state: 'open',
        },
      },
      {
        seq: 2,
        table: 'comments',
        id: 'todo2',
        deleted: false,
        row: {
          trip_id: 't1',
          trip_item_id: 'i1',
          author_id: 'u1',
          body: 'Done',
          is_task: 1,
          task_state: 'resolved',
        },
      },
    ])
    expect(store.getOpenTodos('t1')).toHaveLength(1)
    expect(store.getOpenTodos('t1')[0]!.body).toBe('Open')
  })

  it('itemsWithOpenPrep returns items with open todos', () => {
    const store = useTripStore()
    store.applyChanges([
      {
        seq: 1,
        table: 'trip_items',
        id: 'i1',
        deleted: false,
        row: {
          trip_id: 't1',
          name: 'Camera',
          quantity: 1,
          packed_count: 1,
          state: 'packed',
          mode: 'pack',
          updated_hlc: 'h1',
        },
      },
      {
        seq: 2,
        table: 'trip_items',
        id: 'i2',
        deleted: false,
        row: {
          trip_id: 't1',
          name: 'Clothes',
          quantity: 1,
          packed_count: 0,
          state: 'open',
          mode: 'pack',
          updated_hlc: 'h2',
        },
      },
      {
        seq: 3,
        table: 'comments',
        id: 'todo1',
        deleted: false,
        row: {
          trip_id: 't1',
          trip_item_id: 'i1',
          author_id: 'u1',
          body: 'Charge battery',
          is_task: 1,
          task_state: 'open',
        },
      },
    ])
    const result = store.itemsWithOpenPrep('t1')
    expect(result).toHaveLength(1)
    expect(result[0]!.item.name).toBe('Camera')
    expect(result[0]!.openTodos).toHaveLength(1)
  })

  it('KPIs include todo counts', () => {
    const store = useTripStore()
    store.applyChanges([
      {
        seq: 1,
        table: 'trip_items',
        id: 'i1',
        deleted: false,
        row: {
          trip_id: 't1',
          name: 'A',
          quantity: 1,
          packed_count: 0,
          state: 'open',
          mode: 'pack',
          updated_hlc: 'h1',
        },
      },
      {
        seq: 2,
        table: 'comments',
        id: 'todo1',
        deleted: false,
        row: {
          trip_id: 't1',
          trip_item_id: 'i1',
          author_id: 'u1',
          body: 'Task A',
          is_task: 1,
          task_state: 'open',
        },
      },
      {
        seq: 3,
        table: 'comments',
        id: 'todo2',
        deleted: false,
        row: {
          trip_id: 't1',
          trip_item_id: 'i1',
          author_id: 'u1',
          body: 'Task B',
          is_task: 1,
          task_state: 'resolved',
        },
      },
    ])
    const k = store.kpis('t1')
    expect(k.totalTodos).toBe(2)
    expect(k.resolvedTodos).toBe(1)
  })
})

describe('a trip pulled from the wire', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('derives its duration from the dates, because the server never sends one', () => {
    const store = useTripStore()

    // `duration_days` is a generated column and deliberately not syncable
    // (`syncableColumns` in internal/store/store.go), so every pull carries
    // the dates and no duration. Reading it off the row leaves M4 and the
    // analytics without one for every trip that arrived over the wire.
    store.applyChange({
      seq: 1,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: {
        name: 'Samedan',
        year: 2026,
        status: 'planning',
        start_date: '2026-02-01',
        end_date: '2026-02-08',
      },
    })

    expect(store.getTrip('t1')?.duration_days).toBe(8)
  })

  it('has no duration while one of the dates is open (FR-2.1a)', () => {
    const store = useTripStore()

    store.applyChange({
      seq: 1,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'planning', end_date: '2026-02-08' },
    })

    expect(store.getTrip('t1')?.duration_days).toBeNull()
  })
})

describe('the FR-27.4 ledger snapshot', () => {
  function ledger(store: ReturnType<typeof useTripStore>, id: string) {
    return store.getGeneratedPositions('t1').find((entry) => entry.id === id)
  }

  it('reads its tasks back as a list', () => {
    const store = useTripStore()
    store.applyChange({
      seq: 0,
      table: 'trip_generated_positions',
      id: 'led-1',
      deleted: false,
      row: {
        trip_id: 't1',
        trip_item_id: 'ti-1',
        source_template_id: 'g1',
        source_item_id: 'i1',
        traveler_id: '',
        name: 'Kamera',
        quantity: 1,
        mode: 'pack',
        late_packer: 0,
        tasks: '["Akkus laden","Karte formatieren"]',
      },
    })

    expect(ledger(store, 'led-1')?.tasks).toEqual(['Akkus laden', 'Karte formatieren'])
  })

  it('survives a malformed snapshot rather than taking the trip list down', () => {
    const store = useTripStore()
    store.applyChange({
      seq: 0,
      table: 'trip_generated_positions',
      id: 'led-2',
      deleted: false,
      row: {
        trip_id: 't1',
        trip_item_id: 'ti-1',
        source_template_id: 'g1',
        source_item_id: 'i1',
        traveler_id: '',
        name: 'Kamera',
        quantity: 1,
        mode: 'pack',
        late_packer: 0,
        tasks: '{not json',
      },
    })

    // Empty reads as "the refresh will re-add them", which is recoverable;
    // a thrown parse error inside the store is not.
    expect(ledger(store, 'led-2')?.tasks).toEqual([])
  })
})

describe('the FR-27.4 applied-changes log has a total order', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function logged(store: ReturnType<typeof useTripStore>, id: string, createdAt: string) {
    store.applyChange({
      seq: 0,
      table: 'trip_applied_changes',
      id,
      deleted: false,
      row: {
        trip_id: 't1',
        source_template_id: 'g1',
        source_template_name: 'Makro',
        kind: 'added',
        item_name: id,
        detail: null,
        created_at: createdAt,
      },
    })
  }

  it('breaks a same-instant tie deterministically instead of by arrival order', () => {
    // Two changes from one refresh land in the same millisecond, which is the
    // normal case — the whole plan is applied in one pass. Ordering them by
    // timestamp alone leaves the tie to insertion order, so the same log reads
    // differently on two devices, and an index-based assertion is a coin flip.
    const a = useTripStore()
    logged(a, 'aaa', '2026-08-18T10:00:00.000Z')
    logged(a, 'bbb', '2026-08-18T10:00:00.000Z')

    setActivePinia(createPinia())
    const b = useTripStore()
    logged(b, 'bbb', '2026-08-18T10:00:00.000Z')
    logged(b, 'aaa', '2026-08-18T10:00:00.000Z')

    expect(a.getAppliedChanges('t1').map((c) => c.id)).toEqual(
      b.getAppliedChanges('t1').map((c) => c.id),
    )
  })

  it('still puts the newest change first', () => {
    const store = useTripStore()
    logged(store, 'older', '2026-08-18T10:00:00.000Z')
    logged(store, 'newer', '2026-08-18T10:00:01.000Z')

    expect(store.getAppliedChanges('t1').map((c) => c.id)).toEqual(['newer', 'older'])
  })
})
