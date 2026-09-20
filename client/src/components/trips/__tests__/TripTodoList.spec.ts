// @vitest-environment jsdom
/**
 * The two kinds of task the section lists, told apart on the line (FR-7.6),
 * and whose job the trip's own is (FR-7.5).
 *
 * What is worth pinning: a preparation names the row it belongs to and leads
 * to it, and carries neither seat nor ✕ — it is removed where it lives; the
 * trip's own carries both. For FR-7.5: the seat exists only where somebody
 * can be picked (G-8), a todo already assigned still names its person where
 * nothing can be changed, and a finished todo names but offers nothing.
 */
import { RouterLinkStub, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import type { TripTask } from '@/domain/tripTodos'

import TripTodoList from '../TripTodoList.vue'

/** A task of the trip itself (FR-7.4): no row, and therefore a seat. */
function ownTask(
  body: string,
  state: 'open' | 'resolved',
  assignee: string | null = null,
): TripTask {
  return { id: body, body, task_state: state, item: null, assignee_user_id: assignee }
}

/** A row's preparation (FR-7.3), as FR-7.6 lists it. */
function preparation(
  body: string,
  itemName: string,
  state: 'open' | 'resolved' = 'open',
): TripTask {
  return {
    id: body,
    body,
    task_state: state,
    item: { id: `row-${itemName}`, name: itemName, icon: '📷' },
    assignee_user_id: null,
  }
}

const names: Record<string, string> = { 'u-sia': 'Sia' }

function mountList(tasks: TripTask[], assignable = true) {
  return mount(TripTodoList, {
    props: { tripId: 't1', tasks, assignable, nameOf: (id: string) => names[id] ?? null },
    global: {
      provide: { [ORCHESTRATOR]: {} },
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

describe('TripTodoList — one list, two kinds of task (FR-7.6)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('names the row a preparation belongs to, and leads to that row', () => {
    const wrapper = mountList([preparation('Akkus laden', 'Kamera')])

    const chip = wrapper.get('[data-testid="task-item-Kamera"]')
    expect(chip.text()).toContain('Kamera')
    expect(chip.attributes('aria-label')).toBe('Belongs to Kamera')
    expect(chip.getComponent(RouterLinkStub).props('to')).toBe('/trips/t1?item=row-Kamera')
  })

  it('gives a preparation neither a seat nor a ✕ — it is removed where it lives', () => {
    const wrapper = mountList([preparation('Akkus laden', 'Kamera')])

    expect(wrapper.find('[data-testid="trip-todo-assign-Akkus laden"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="trip-todo-remove-Akkus laden"]').exists()).toBe(false)
  })

  it('carries no chip on a task of the trip itself, which is what tells the two apart', () => {
    const wrapper = mountList([ownTask('Pflanzen giessen', 'open')])

    expect(wrapper.find('[data-testid^="task-item-"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="trip-todo-remove-Pflanzen giessen"]').exists()).toBe(true)
  })

  it('reports a tick on either kind, with the task that was ticked', async () => {
    const wrapper = mountList([
      ownTask('Pflanzen giessen', 'open'),
      preparation('Akkus laden', 'Kamera'),
    ])

    await wrapper.get('[data-testid="trip-todo-Akkus laden"] ion-checkbox').trigger('ionChange')
    await wrapper
      .get('[data-testid="trip-todo-Pflanzen giessen"] ion-checkbox')
      .trigger('ionChange')

    const toggled = wrapper.emitted('toggle') ?? []
    expect(toggled.map(([task]) => (task as TripTask).body)).toEqual([
      'Akkus laden',
      'Pflanzen giessen',
    ])
  })

  it('folds the resolved ones of both kinds away, and opens them together', async () => {
    const wrapper = mountList([
      ownTask('Kühlschrank leeren', 'resolved'),
      preparation('Objektiv putzen', 'Kamera', 'resolved'),
    ])

    expect(wrapper.find('[data-testid="trip-todo-Objektiv putzen"]').exists()).toBe(false)
    const fold = wrapper.get('[data-testid="trip-todos-resolved"]')
    expect(fold.text()).toContain('2')

    await fold.trigger('click')
    expect(wrapper.find('[data-testid="trip-todo-Objektiv putzen"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trip-todo-Kühlschrank leeren"]').exists()).toBe(true)
  })
})

describe('TripTodoList — whose job a todo is (FR-7.5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('ends every open todo in a seat: the assignee, or an empty one', () => {
    const wrapper = mountList([
      ownTask('Pflanzen giessen', 'open', 'u-sia'),
      ownTask('Kühlschrank leeren', 'open'),
    ])

    const assigned = wrapper.get('[data-testid="trip-todo-assign-Pflanzen giessen"]')
    expect(assigned.text()).toBe('SI')
    expect(assigned.attributes('aria-label')).toBe('Assigned to')
    const empty = wrapper.get('[data-testid="trip-todo-assign-Kühlschrank leeren"]')
    expect(empty.find('.assign-empty').exists()).toBe(true)
    expect(empty.attributes('aria-label')).toBe('Assign to somebody')
  })

  it('reports a tap on the seat with the todo, and nothing else', async () => {
    const wrapper = mountList([ownTask('Pflanzen giessen', 'open')])

    await wrapper.get('[data-testid="trip-todo-assign-Pflanzen giessen"]').trigger('click')

    const assigned = wrapper.emitted('assign') ?? []
    expect(assigned.map(([task]) => (task as TripTask).id)).toEqual(['Pflanzen giessen'])
    expect(wrapper.emitted('remove')).toBeUndefined()
  })

  it('offers no seat where nobody can be picked, but still names an assignee', () => {
    const wrapper = mountList(
      [ownTask('Pflanzen giessen', 'open', 'u-sia'), ownTask('Kühlschrank leeren', 'open')],
      false,
    )

    expect(wrapper.find('[data-testid^="trip-todo-assign-"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="trip-todo-assignee-Pflanzen giessen"]').text()).toBe('SI')
    expect(wrapper.find('[data-testid="trip-todo-assignee-Kühlschrank leeren"]').exists()).toBe(
      false,
    )
  })

  it('names who had a finished todo, and offers no seat on it', async () => {
    const wrapper = mountList([ownTask('Pflanzen giessen', 'resolved', 'u-sia')])

    await wrapper.get('[data-testid="trip-todos-resolved"]').trigger('click')

    expect(wrapper.get('[data-testid="trip-todo-assignee-Pflanzen giessen"]').text()).toBe('SI')
    expect(wrapper.find('[data-testid="trip-todo-assign-Pflanzen giessen"]').exists()).toBe(false)
  })
})
