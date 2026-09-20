// @vitest-environment jsdom
/**
 * FR-7.5: a trip todo is handed to somebody the way a packing row is — the
 * seat at its end names the assignee, or stands empty, and tapping it asks
 * the screen for the picker.
 *
 * What is worth pinning: the seat exists only where somebody can be picked
 * (G-8), a todo already assigned still names its person where nothing can be
 * changed, and a finished todo names but offers nothing.
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { PullChange } from '@/api/types'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'

import TripTodoList from '../TripTodoList.vue'

function tripTodo(
  body: string,
  state: 'open' | 'resolved',
  assignee: string | null = null,
): PullChange {
  return {
    seq: 1,
    table: TABLE.comments,
    id: body,
    deleted: false,
    row: {
      trip_id: 't1',
      trip_item_id: null,
      author_id: 'u1',
      body,
      is_task: 1,
      task_state: state,
      assignee_user_id: assignee,
    },
  }
}

const names: Record<string, string> = { 'u-sia': 'Sia' }

function mountList(assignable: boolean) {
  return mount(TripTodoList, {
    props: { tripId: 't1', assignable, nameOf: (id: string) => names[id] ?? null },
    global: { provide: { [ORCHESTRATOR]: {} } },
  })
}

describe('TripTodoList — whose job a todo is (FR-7.5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('ends every open todo in a seat: the assignee, or an empty one', () => {
    useTripStore().applyChanges([
      tripTodo('Pflanzen giessen', 'open', 'u-sia'),
      tripTodo('Kühlschrank leeren', 'open'),
    ])
    const wrapper = mountList(true)

    const assigned = wrapper.get('[data-testid="trip-todo-assign-Pflanzen giessen"]')
    expect(assigned.text()).toBe('SI')
    expect(assigned.attributes('aria-label')).toBe('Assigned to')
    const empty = wrapper.get('[data-testid="trip-todo-assign-Kühlschrank leeren"]')
    expect(empty.find('.assign-empty').exists()).toBe(true)
    expect(empty.attributes('aria-label')).toBe('Assign to somebody')
  })

  it('reports a tap on the seat with the todo, and nothing else', async () => {
    useTripStore().applyChanges([tripTodo('Pflanzen giessen', 'open')])
    const wrapper = mountList(true)

    await wrapper.get('[data-testid="trip-todo-assign-Pflanzen giessen"]').trigger('click')

    const assigned = wrapper.emitted('assign') ?? []
    expect(assigned.map(([todo]) => (todo as { id: string }).id)).toEqual(['Pflanzen giessen'])
    expect(wrapper.emitted('remove')).toBeUndefined()
  })

  it('offers no seat where nobody can be picked, but still names an assignee', () => {
    useTripStore().applyChanges([
      tripTodo('Pflanzen giessen', 'open', 'u-sia'),
      tripTodo('Kühlschrank leeren', 'open'),
    ])
    const wrapper = mountList(false)

    expect(wrapper.find('[data-testid^="trip-todo-assign-"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="trip-todo-assignee-Pflanzen giessen"]').text()).toBe('SI')
    expect(wrapper.find('[data-testid="trip-todo-assignee-Kühlschrank leeren"]').exists()).toBe(
      false,
    )
  })

  it('names who had a finished todo, and offers no seat on it', async () => {
    useTripStore().applyChanges([tripTodo('Pflanzen giessen', 'resolved', 'u-sia')])
    const wrapper = mountList(true)

    await wrapper.get('[data-testid="trip-todos-resolved"]').trigger('click')

    expect(wrapper.get('[data-testid="trip-todo-assignee-Pflanzen giessen"]').text()).toBe('SI')
    expect(wrapper.find('[data-testid="trip-todo-assign-Pflanzen giessen"]').exists()).toBe(false)
  })
})
