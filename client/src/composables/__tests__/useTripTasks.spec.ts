/**
 * FR-7.6's join: the rule is `tripTasks` and is tested without stores; what
 * lives here is the one thing the composable decides on its own — which row a
 * preparation names, and where that row's **mark** comes from.
 *
 * It comes from the master item (FR-28.7), never from the trip row, and an
 * ad-hoc row has no master item and therefore no mark. Nothing else asserts
 * that: the e2e rows are quick-added, so their chips are markless by
 * construction, and a chip that silently lost its mark would pass every one
 * of those cases.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { installHarness } from '@/__tests__/harness'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import type { PullChange } from '@/api/types'

import { useTripTasks } from '../useTripTasks'

beforeEach(() => {
  installHarness()
})

const TRIP = 'trip-1'

function masterItem(id: string, name: string, icon: string | null): PullChange {
  return {
    seq: 1,
    table: TABLE.items,
    id,
    deleted: false,
    row: { name, icon, category_name: null, weight_grams: null },
  }
}

function row(id: string, name: string, sourceItemId: string | null): PullChange {
  return {
    seq: 1,
    table: TABLE.tripItems,
    id,
    deleted: false,
    row: {
      trip_id: TRIP,
      name,
      source_item_id: sourceItemId,
      quantity: 1,
      packed_count: 0,
      state: 'open',
    },
  }
}

function preparation(id: string, rowId: string, body: string): PullChange {
  return {
    seq: 1,
    table: TABLE.comments,
    id,
    deleted: false,
    row: {
      trip_id: TRIP,
      trip_item_id: rowId,
      author_id: 'u1',
      body,
      is_task: 1,
      task_state: 'open',
    },
  }
}

describe('useTripTasks (FR-7.6)', () => {
  it('names the row a preparation prepares, with the mark its master item carries', () => {
    useMasterStore().applyChanges([masterItem('m1', 'Kamera', '📷')])
    useTripStore().applyChanges([row('r1', 'Kamera', 'm1'), preparation('p1', 'r1', 'Akkus laden')])

    const [task] = useTripTasks().tasksOf(TRIP)
    expect(task?.item).toEqual({ id: 'r1', name: 'Kamera', icon: '📷' })
  })

  it('gives an ad-hoc row no mark, because it has no master item to inherit one from', () => {
    useTripStore().applyChanges([
      row('r1', 'Zeltheringe', null),
      preparation('p1', 'r1', 'Nachkaufen'),
    ])

    const [task] = useTripTasks().tasksOf(TRIP)
    expect(task?.item).toEqual({ id: 'r1', name: 'Zeltheringe', icon: null })
  })

  it('leaves out a preparation whose row this device does not hold', () => {
    useTripStore().applyChanges([preparation('p1', 'gone', 'Akkus laden')])

    expect(useTripTasks().tasksOf(TRIP)).toEqual([])
  })
})
