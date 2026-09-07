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
    attributes: null,
    imported: false,
    ...overrides,
  }
}

/** One pulled row, the way the feed delivers it. */
function row(table: string, id: string, fields: Record<string, unknown>): PullChange {
  return { seq: 1, table, id, deleted: false, row: fields }
}

describe('tripStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts empty', () => {
    const tripStore = useTripStore()
    expect(tripStore.tripList).toEqual([])
    expect(tripStore.getItems('t1')).toEqual([])
  })

  it('sets and retrieves a trip', () => {
    const tripStore = useTripStore()
    tripStore.setTrip(makeTrip())
    expect(tripStore.getTrip('t1')?.name).toBe('Beach Trip')
    expect(tripStore.tripList).toHaveLength(1)
  })

  it('removes a trip and its items', () => {
    const tripStore = useTripStore()
    tripStore.setTrip(makeTrip())
    tripStore.applyChange({
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
    expect(tripStore.getItems('t1')).toHaveLength(1)

    tripStore.removeTrip('t1')
    expect(tripStore.getTrip('t1')).toBeUndefined()
    expect(tripStore.getItems('t1')).toEqual([])
  })

  /**
   * A trip's children hang off it in the schema, and the server can announce
   * only three of them: `change_log.trip_id` cascades too, so the trip
   * partition's whole feed dies with the row it describes
   * (`internal/store/master.go`, `cascadeChildren`). Everything else the
   * client has to drop itself, and until 2026-09-02 it dropped four of nine
   * tables — the trip vanished from the screen while its rows stayed.
   */
  describe('a deleted trip takes its children with it (C-3a)', () => {
    function seedChildren(tripStore: ReturnType<typeof useTripStore>) {
      tripStore.setTrip(makeTrip())
      const rows: PullChange[] = [
        row(TABLE.tripItems, 'i1', {
          trip_id: 't1',
          name: 'Towel',
          quantity: 1,
          packed_count: 0,
          state: 'open',
          mode: 'pack',
        }),
        row(TABLE.travelers, 'trav1', { trip_id: 't1', name: 'Ada' }),
        row(TABLE.containers, 'c1', { trip_id: 't1', name: 'Rucksack' }),
        row(TABLE.tripMembers, 'mem1', { trip_id: 't1', user_id: 'u1', role: 'owner' }),
        row(TABLE.comments, 'com1', { trip_id: 't1', body: 'Vergiss die Karte nicht' }),
        row(TABLE.comments, 'todo1', {
          trip_id: 't1',
          trip_item_id: 'i1',
          body: 'Akku laden',
          is_task: true,
          task_state: 'open',
        }),
        row(TABLE.tripTemplateSources, 'src1', { trip_id: 't1', template_id: 'tpl1' }),
        row(TABLE.tripGeneratedPositions, 'gen1', {
          trip_id: 't1',
          template_item_id: 'pos1',
          trip_item_id: 'i1',
        }),
        row(TABLE.tripAppliedChanges, 'app1', {
          trip_id: 't1',
          template_id: 'tpl1',
          created_at: '2026-09-01T10:00:00Z',
        }),
      ]
      tripStore.applyChanges(rows)
    }

    it('names every child row, so the cascade can tombstone them', () => {
      const tripStore = useTripStore()
      seedChildren(tripStore)

      expect(tripStore.childRows('t1')).toEqual(
        expect.arrayContaining([
          { table: TABLE.comments, id: 'com1' },
          { table: TABLE.comments, id: 'todo1' },
          { table: TABLE.tripGeneratedPositions, id: 'gen1' },
          { table: TABLE.tripItems, id: 'i1' },
          { table: TABLE.travelers, id: 'trav1' },
          { table: TABLE.containers, id: 'c1' },
          { table: TABLE.tripMembers, id: 'mem1' },
          { table: TABLE.tripTemplateSources, id: 'src1' },
          { table: TABLE.tripAppliedChanges, id: 'app1' },
        ]),
      )
      expect(tripStore.childRows('t1')).toHaveLength(9)
      expect(tripStore.childRows('unknown-trip')).toEqual([])
    })

    it('names a child before the parent it hangs off', () => {
      const tripStore = useTripStore()
      seedChildren(tripStore)
      const at = (table: string, id: string) =>
        tripStore.childRows('t1').findIndex((c) => c.table === table && c.id === id)

      // The comment and the generated position hang off the trip item; the
      // server emits its own cascade leaf-first for the same reason.
      expect(at(TABLE.comments, 'todo1')).toBeLessThan(at(TABLE.tripItems, 'i1'))
      expect(at(TABLE.tripGeneratedPositions, 'gen1')).toBeLessThan(at(TABLE.tripItems, 'i1'))
    })

    it('empties every bucket the trip owned', () => {
      const tripStore = useTripStore()
      seedChildren(tripStore)

      tripStore.removeTrip('t1')

      expect(tripStore.getTrip('t1')).toBeUndefined()
      expect(tripStore.getItems('t1')).toEqual([])
      expect(tripStore.getTravelers('t1')).toEqual([])
      expect(tripStore.getContainers('t1')).toEqual([])
      expect(tripStore.getMembers('t1')).toEqual([])
      expect(tripStore.getComments('t1')).toEqual([])
      expect(tripStore.getTodos('t1')).toEqual([])
      expect(tripStore.getTemplateSources('t1')).toEqual([])
      expect(tripStore.getGeneratedPositions('t1')).toEqual([])
      expect(tripStore.getAppliedChanges('t1')).toEqual([])
      expect(tripStore.childRows('t1')).toEqual([])
    })

    it("leaves another trip's rows alone", () => {
      const tripStore = useTripStore()
      seedChildren(tripStore)
      tripStore.setTrip(makeTrip({ id: 't2' }))
      tripStore.applyChanges([
        row(TABLE.travelers, 'trav2', { trip_id: 't2', name: 'Grace' }),
        row(TABLE.tripTemplateSources, 'src2', { trip_id: 't2', template_id: 'tpl1' }),
      ])

      tripStore.removeTrip('t1')

      expect(tripStore.getTravelers('t2')).toHaveLength(1)
      expect(tripStore.getTemplateSources('t2')).toHaveLength(1)
    })
  })

  it('applies trip pull change', () => {
    const tripStore = useTripStore()
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
    tripStore.applyChange(change)
    expect(tripStore.getTrip('t1')?.name).toBe('Ski Trip')
    expect(tripStore.getTrip('t1')?.status).toBe('planning')
  })

  it('applies trip deletion', () => {
    const tripStore = useTripStore()
    tripStore.setTrip(makeTrip())
    tripStore.applyChange({ seq: 2, table: 'trips', id: 't1', deleted: true, row: null })
    expect(tripStore.getTrip('t1')).toBeUndefined()
  })

  it('applies trip_items pull changes', () => {
    const tripStore = useTripStore()
    tripStore.applyChanges([
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

    const items = tripStore.getItems('t1')
    expect(items).toHaveLength(2)
    expect(items[0]!.name).toBe('Towel')
    expect(items[0]!.packed_count).toBe(1)
  })

  it('upserts existing trip item', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
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
    tripStore.applyChange({
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

    const items = tripStore.getItems('t1')
    expect(items).toHaveLength(1)
    expect(items[0]!.packed_count).toBe(2)
  })

  it('deletes trip item', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
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
    tripStore.applyChange({ seq: 2, table: 'trip_items', id: 'i1', deleted: true, row: null })
    expect(tripStore.getItems('t1')).toHaveLength(0)
  })

  it('computes KPIs', () => {
    const tripStore = useTripStore()
    tripStore.applyChanges([
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

    const k = tripStore.kpis('t1')
    expect(k.totalItems).toBe(5) // 2 + 3
    expect(k.packedItems).toBe(4) // 1 + 3
    expect(k.totalWeight).toBe(800) // 100*2 + 200*3
    expect(k.packedWeight).toBe(700) // 100*1 + 200*3
    expect(k.totalValue).toBe(4000) // 500*2 + 1000*3
    expect(k.packedValue).toBe(3500) // 500*1 + 1000*3
  })

  it('counts a skipped row as one unit, done — the FR-25.22 arithmetic M4 draws', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'i1',
      deleted: false,
      row: {
        trip_id: 't1',
        name: 'Left behind on purpose',
        quantity: 0,
        packed_count: 0,
        state: 'skipped',
        mode: 'pack',
        updated_hlc: 'h1',
      },
    })

    const k = tripStore.kpis('t1')
    // On the numbers alone this row is 0/0, and a trip of nothing but
    // considered rows would read 0 % for ever (FR-5.5).
    expect(k.totalItems).toBe(1)
    expect(k.packedItems).toBe(1)
  })

  it('handles travelers', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
      seq: 1,
      table: 'travelers',
      id: 'tv1',
      deleted: false,
      row: { trip_id: 't1', name: 'Alice' },
    })
    expect(tripStore.getTravelers('t1')).toHaveLength(1)
    expect(tripStore.getTravelers('t1')[0]!.name).toBe('Alice')

    tripStore.applyChange({ seq: 2, table: 'travelers', id: 'tv1', deleted: true, row: null })
    expect(tripStore.getTravelers('t1')).toHaveLength(0)
  })

  it('handles containers', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
      seq: 1,
      table: 'containers',
      id: 'c1',
      deleted: false,
      row: { trip_id: 't1', name: 'Suitcase', max_weight_grams: 23000 },
    })
    expect(tripStore.getContainers('t1')).toHaveLength(1)

    tripStore.applyChange({ seq: 2, table: 'containers', id: 'c1', deleted: true, row: null })
    expect(tripStore.getContainers('t1')).toHaveLength(0)
  })

  // --- Preparation Todos (FR-7.3) ---

  it('applies comment with is_task as todo', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
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
    expect(tripStore.getTodos('t1')).toHaveLength(1)
    expect(tripStore.getTodos('t1')[0]!.body).toBe('Charge battery')
    expect(tripStore.getTodos('t1')[0]!.task_state).toBe('open')
  })

  it('ignores non-task comments', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
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
    expect(tripStore.getTodos('t1')).toHaveLength(0)
  })

  it('upserts existing todo (resolve)', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
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
    tripStore.applyChange({
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
    expect(tripStore.getTodos('t1')).toHaveLength(1)
    expect(tripStore.getTodos('t1')[0]!.task_state).toBe('resolved')
  })

  it('deletes a todo', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
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
    tripStore.applyChange({ seq: 2, table: 'comments', id: 'todo1', deleted: true, row: null })
    expect(tripStore.getTodos('t1')).toHaveLength(0)
  })

  it('getItemTodos filters by trip item', () => {
    const tripStore = useTripStore()
    tripStore.applyChanges([
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
    expect(tripStore.getItemTodos('t1', 'i1')).toHaveLength(2)
    expect(tripStore.getItemTodos('t1', 'i2')).toHaveLength(1)
  })

  it('getOpenTodos returns only open todos', () => {
    const tripStore = useTripStore()
    tripStore.applyChanges([
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
    expect(tripStore.getOpenTodos('t1')).toHaveLength(1)
    expect(tripStore.getOpenTodos('t1')[0]!.body).toBe('Open')
  })

  it('itemsWithOpenPrep returns items with open todos', () => {
    const tripStore = useTripStore()
    tripStore.applyChanges([
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
    const result = tripStore.itemsWithOpenPrep('t1')
    expect(result).toHaveLength(1)
    expect(result[0]!.item.name).toBe('Camera')
    expect(result[0]!.openTodos).toHaveLength(1)
  })

  it('KPIs include todo counts', () => {
    const tripStore = useTripStore()
    tripStore.applyChanges([
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
    const k = tripStore.kpis('t1')
    expect(k.totalTodos).toBe(2)
    expect(k.resolvedTodos).toBe(1)
  })
})

describe('a trip pulled from the wire', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('derives its duration from the dates, because the server never sends one', () => {
    const tripStore = useTripStore()

    // `duration_days` is a generated column and deliberately not syncable
    // (`syncableColumns` in internal/store/store.go), so every pull carries
    // the dates and no duration. Reading it off the row leaves M4 and the
    // analytics without one for every trip that arrived over the wire.
    tripStore.applyChange({
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

    expect(tripStore.getTrip('t1')?.duration_days).toBe(8)
  })

  it('has no duration while one of the dates is open (FR-2.1a)', () => {
    const tripStore = useTripStore()

    tripStore.applyChange({
      seq: 1,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, status: 'planning', end_date: '2026-02-08' },
    })

    expect(tripStore.getTrip('t1')?.duration_days).toBeNull()
  })
})

describe('the FR-27.4 ledger snapshot', () => {
  function ledger(tripStore: ReturnType<typeof useTripStore>, id: string) {
    return tripStore.getGeneratedPositions('t1').find((entry) => entry.id === id)
  }

  it('reads its tasks back as a list', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
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

    expect(ledger(tripStore, 'led-1')?.tasks).toEqual(['Akkus laden', 'Karte formatieren'])
  })

  it('survives a malformed snapshot rather than taking the trip list down', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
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
    expect(ledger(tripStore, 'led-2')?.tasks).toEqual([])
  })
})

describe('the FR-27.4 applied-changes log has a total order', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function logged(tripStore: ReturnType<typeof useTripStore>, id: string, createdAt: string) {
    tripStore.applyChange({
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
    const tripStore = useTripStore()
    logged(tripStore, 'older', '2026-08-18T10:00:00.000Z')
    logged(tripStore, 'newer', '2026-08-18T10:00:01.000Z')

    expect(tripStore.getAppliedChanges('t1').map((c) => c.id)).toEqual(['newer', 'older'])
  })
})
