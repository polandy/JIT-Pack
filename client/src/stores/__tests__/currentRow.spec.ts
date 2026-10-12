/**
 * `currentRow` — the row a store holds, in the shape it travels (ARCH-12).
 * The write funnel lays every update over it, so a column it drops is a
 * column the next write blanks on screen.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import type { PullChange } from '@/api/types'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/api/tables'

function change(table: string, id: string, row: Record<string, unknown>): PullChange {
  return { seq: 1, table, id, deleted: false, row }
}

const COMMENT = { trip_id: 't1', author_id: 'u1', body: 'Ventil prüfen' }

describe('currentRow', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reads a trip row back in its wire shape, from whichever bucket holds it', () => {
    const tripStore = useTripStore()
    const row = { trip_id: 't1', name: 'Zelt', quantity: 2, packed_count: 1, state: 'partial' }
    tripStore.applyChange(change(TABLE.tripItems, 'ti1', row))

    expect(tripStore.currentRow(TABLE.tripItems, 'ti1')).toMatchObject(row)
  })

  it('reads a master row back, and nothing for a row it does not hold', () => {
    const masterStore = useMasterStore()
    masterStore.applyChange(change(TABLE.tags, 'tag-1', { name: 'Berg', sort_order: 3 }))

    expect(masterStore.currentRow(TABLE.tags, 'tag-1')).toMatchObject({
      name: 'Berg',
      sort_order: 3,
    })
    expect(masterStore.currentRow(TABLE.tags, 'tag-2')).toBeUndefined()
  })

  // FR-7.2/7.4: one table, three readings. Each list encodes its own type, so
  // a task read back as a plain comment would lose its task columns.
  it.each([
    ['a plain comment', { ...COMMENT, trip_item_id: 'ti1', is_task: 0 }, 'body'],
    [
      'a preparation',
      { ...COMMENT, trip_item_id: 'ti1', is_task: 1, task_state: 'open' },
      'task_state',
    ],
    [
      'the trip’s own task',
      { ...COMMENT, trip_item_id: null, is_task: 1, task_state: 'open' },
      'task_state',
    ],
  ])('reads %s back through the list that holds it', (_kind, row, column) => {
    const tripStore = useTripStore()
    tripStore.applyChange(change(TABLE.comments, 'c1', row))

    const current = tripStore.currentRow(TABLE.comments, 'c1')

    expect(current?.[column]).toBe(row[column as keyof typeof row])
    expect(current?.['trip_id']).toBe('t1')
  })
})
