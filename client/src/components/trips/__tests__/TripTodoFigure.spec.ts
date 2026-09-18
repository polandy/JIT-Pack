// @vitest-environment jsdom
/**
 * FR-7.4: the trip's todos as a figure beside the packing share, on M4's
 * header line and M1's hero.
 *
 * What is worth pinning: it counts the trip's own todos from the store and
 * says so as a fraction, and it renders nothing at all for a trip with none —
 * „0/0" beside a share would claim a second answer that does not exist.
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { PullChange } from '@/api/types'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

import TripTodoFigure from '../TripTodoFigure.vue'

function tripTodo(id: string, state: 'open' | 'resolved'): PullChange {
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

const props = { tripId: 't1', ringSize: 42, testid: 'todo-fraction' }

describe('TripTodoFigure — the second check, beside the share (FR-7.4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('states the trip’s todos as done over total, with its ring at the same share', () => {
    useTripStore().applyChanges([
      tripTodo('a', 'resolved'),
      tripTodo('b', 'open'),
      tripTodo('c', 'open'),
      tripTodo('d', 'open'),
    ])
    const wrapper = mount(TripTodoFigure, { props })

    expect(wrapper.get('[data-testid="todo-fraction"]').text()).toBe('1/4')
    expect(wrapper.get('[data-testid="progress-ring"]').attributes('aria-label')).toBe('25%')
    expect(wrapper.find('.track').exists()).toBe(false)
  })

  it('renders nothing for a trip with no todo, rather than 0/0', () => {
    // The positive signal: another trip's todo is in the store, so the
    // absence is the filter by trip and not an empty store.
    const tripStore = useTripStore()
    tripStore.applyChange({
      ...tripTodo('x', 'open'),
      row: { ...tripTodo('x', 'open').row, trip_id: 't2' },
    })
    expect(tripStore.getTripTodos('t2')).toHaveLength(1)

    const wrapper = mount(TripTodoFigure, { props })

    expect(wrapper.find('[data-testid="todo-fraction"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="progress-ring"]').exists()).toBe(false)
  })
})
