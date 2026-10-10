// @vitest-environment jsdom
/**
 * FR-7.4: the trip's tasks as a figure beside the packing share, on M4's
 * header line and M1's hero.
 *
 * What is worth pinning: it counts the trip's own tasks from the store and
 * says so as a fraction, and it renders nothing at all for a trip with none —
 * „0/0" beside a share would claim a second answer that does not exist.
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { PullChange } from '@/api/types'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/api/tables'

import TripTaskFigure from '../TripTaskFigure.vue'

function ownTask(id: string, state: 'open' | 'resolved'): PullChange {
  return {
    seq: 1,
    table: TABLE.comments,
    id,
    deleted: false,
    row: {
      trip_id: 't1',
      trip_item_id: null,
      author_id: 'u1',
      body: id,
      is_task: 1,
      task_state: state,
    },
  }
}

const props = { tripId: 't1', ringSize: 42, testid: 'task-fraction' }

describe('TripTaskFigure — the second check, beside the share (FR-7.4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('states the trip’s tasks like the share beside it: fraction, open count, ring and track', () => {
    useTripStore().applyChanges([
      ownTask('a', 'resolved'),
      ownTask('b', 'open'),
      ownTask('c', 'open'),
      ownTask('d', 'open'),
    ])
    const wrapper = mount(TripTaskFigure, { props })

    expect(wrapper.get('[data-testid="task-fraction"]').text()).toBe('1/4 tasks')
    expect(wrapper.get('.detail').text()).toBe('3 open')
    expect(wrapper.get('[data-testid="progress-ring"]').attributes('aria-label')).toBe('25%')
    expect(wrapper.get('.track i').attributes('style')).toContain('width: 25%')
    expect(wrapper.get('.figure').classes()).toContain('paired')
  })

  it('drops the open count once every task is done, like the share drops its own', () => {
    useTripStore().applyChanges([ownTask('a', 'resolved'), ownTask('b', 'resolved')])
    const wrapper = mount(TripTaskFigure, { props })

    expect(wrapper.get('[data-testid="task-fraction"]').text()).toBe('2/2 tasks')
    expect(wrapper.find('.detail').exists()).toBe(false)
  })

  it('renders nothing for a trip with no task, rather than 0/0', () => {
    // The positive signal: another trip's task is in the store, so the
    // absence is the filter by trip and not an empty store.
    const tripStore = useTripStore()
    tripStore.applyChange({
      ...ownTask('x', 'open'),
      row: { ...ownTask('x', 'open').row, trip_id: 't2' },
    })
    expect(tripStore.getOwnTasks('t2')).toHaveLength(1)

    const wrapper = mount(TripTaskFigure, { props })

    expect(wrapper.find('[data-testid="task-fraction"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="progress-ring"]').exists()).toBe(false)
  })
})
