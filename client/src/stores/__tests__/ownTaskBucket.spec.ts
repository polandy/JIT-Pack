import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTripStore } from '../tripStore'
import type { PullChange } from '@/api/types'
import { TABLE } from '@/api/tables'
import { cascadeOf } from '@/sync/cascade'

/**
 * FR-7.4: a task comment with no `trip_item_id` is the trip's own task. The
 * store keeps it in a bucket of its own, and every packing figure has to stay
 * blind to it — the reason the bucket exists rather than a filter.
 */

function change(id: string, fields: Record<string, unknown>, seq = 1): PullChange {
  return { seq, table: TABLE.comments, id, deleted: false, row: fields }
}

function ownTask(id: string, body: string, state: 'open' | 'resolved' = 'open'): PullChange {
  return change(id, {
    trip_id: 't1',
    trip_item_id: null,
    author_id: 'u1',
    body,
    is_task: 1,
    task_state: state,
  })
}

/** One packed row, so doneness has something to be read off. */
const packedRow: PullChange = {
  seq: 1,
  table: TABLE.tripItems,
  id: 'i1',
  deleted: false,
  row: { trip_id: 't1', name: 'Zelt', quantity: 1, packed_count: 1, state: 'packed', mode: 'pack' },
}

describe('the trip’s own tasks in the trip store (FR-7.4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('files an unanchored task as the trip’s own, not as a row’s or a comment', () => {
    const tripStore = useTripStore()
    tripStore.applyChange(ownTask('tt1', 'Pflanzen giessen'))

    expect(tripStore.getOwnTasks('t1').map((t) => t.body)).toEqual(['Pflanzen giessen'])
    expect(tripStore.getPrepTasks('t1')).toEqual([])
    expect(tripStore.getTripComments('t1')).toEqual([])
  })

  it('counts toward no packing figure — a packed trip stays fully packed', () => {
    const tripStore = useTripStore()
    tripStore.applyChanges([packedRow, ownTask('tt1', 'Pflanzen giessen')])

    const kpis = tripStore.kpis('t1')
    expect(kpis.packedItems).toBe(kpis.totalItems)
    expect(kpis.totalPrepTasks).toBe(0)
    expect(tripStore.itemsWithOpenPrep('t1')).toEqual([])
    // The positive signal beside those absences: the task is in the store.
    expect(tripStore.getOwnTasks('t1')).toHaveLength(1)
  })

  it('resolves in place and is gone after its tombstone', () => {
    const tripStore = useTripStore()
    tripStore.applyChange(ownTask('tt1', 'Pflanzen giessen'))
    tripStore.applyChange({ ...ownTask('tt1', 'Pflanzen giessen', 'resolved'), seq: 2 })
    expect(tripStore.getOwnTasks('t1').map((t) => t.task_state)).toEqual(['resolved'])

    tripStore.applyChange({ seq: 3, table: TABLE.comments, id: 'tt1', deleted: true, row: null })
    expect(tripStore.getOwnTasks('t1')).toEqual([])
  })

  it('moves a trip-level comment flagged as a task into the own-task list (FR-7.2)', () => {
    const tripStore = useTripStore()
    const fields = { trip_id: 't1', trip_item_id: null, author_id: 'u1', body: 'Katze füttern' }
    tripStore.applyChange(change('c1', { ...fields, is_task: 0 }))
    expect(tripStore.getTripComments('t1')).toHaveLength(1)

    tripStore.applyChange(change('c1', { ...fields, is_task: 1, task_state: 'open' }, 2))
    expect(tripStore.getTripComments('t1')).toEqual([])
    expect(tripStore.getOwnTasks('t1').map((t) => t.body)).toEqual(['Katze füttern'])
  })

  it('lists open before resolved, each half by text — an order a reload keeps', () => {
    const tripStore = useTripStore()
    tripStore.applyChanges([
      ownTask('a', 'Kühlschrank leeren', 'resolved'),
      ownTask('b', 'Pflanzen giessen'),
      ownTask('c', 'Briefkasten leeren lassen'),
    ])

    expect(tripStore.getOwnTasks('t1').map((t) => t.body)).toEqual([
      'Briefkasten leeren lassen',
      'Pflanzen giessen',
      'Kühlschrank leeren',
    ])
  })

  it('goes with a deleted trip, and the cascade names it', () => {
    const tripStore = useTripStore()
    tripStore.setTrip({
      id: 't1',
      name: 'Samedan',
      status: 'active',
      year: 2026,
      start_date: null,
      end_date: null,
      duration_days: null,
      series_id: null,
      attributes: null,
      packing_closed_at: null,
      imported: false,
    })
    tripStore.applyChange(ownTask('tt1', 'Pflanzen giessen'))

    expect(cascadeOf(TABLE.trips, 't1', tripStore)).toContainEqual({
      table: TABLE.comments,
      id: 'tt1',
    })
    tripStore.applyChange({ seq: 2, table: TABLE.trips, id: 't1', deleted: true, row: null })
    expect(tripStore.getOwnTasks('t1')).toEqual([])
  })

  it('is untouched when a row of the trip is deleted — it hangs off no row', () => {
    const tripStore = useTripStore()
    tripStore.applyChanges([packedRow, ownTask('tt1', 'Pflanzen giessen')])

    expect(cascadeOf(TABLE.tripItems, 'i1', tripStore)).not.toContainEqual({
      table: TABLE.comments,
      id: 'tt1',
    })
    tripStore.applyChange({ seq: 2, table: TABLE.tripItems, id: 'i1', deleted: true, row: null })
    expect(tripStore.getOwnTasks('t1')).toHaveLength(1)
  })
})
