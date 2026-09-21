// @vitest-environment jsdom
/**
 * The two kinds of task the section lists, told apart on the line (FR-7.6),
 * and whose job the trip's own is (FR-7.5).
 *
 * What is worth pinning: a preparation names the row it belongs to and leads
 * to it, and carries no ✕ — it is removed where it lives; the trip's own
 * carries one. For FR-7.5: the seat exists only where somebody can be picked
 * (G-8), a todo already assigned still names its person where nothing can be
 * changed, and a finished todo names but offers nothing.
 *
 * **Since FR-7.7 the seat is on both kinds** (the owner's request of
 * 2026-09-20: a task is handed over like a pack item), each line carries the
 * one stamp of Q3 B, and the composer belongs to the screen rather than the
 * list — M4's window has none, because everything it shows hangs off a row.
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
  return { id: body, body, task_state: state, item: null, assignee_user_id: assignee, ...FACTS }
}

/** FR-7.7's facts, absent unless a case is about them. */
const FACTS = {
  task_tag_id: null,
  phase: 'before',
  author_id: 'u-andy',
  created_at: null,
  resolved_at: null,
  resolved_by_user_id: null,
} as const

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
    ...FACTS,
  }
}

const names: Record<string, string> = { 'u-sia': 'Sia' }

function mountList(tasks: TripTask[], assignable = true, extra: Record<string, unknown> = {}) {
  return mount(TripTodoList, {
    props: {
      tripId: 't1',
      tasks,
      assignable,
      nameOf: (id: string | null) => (id ? (names[id] ?? null) : null),
      ...extra,
    },
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

  /*
   * FR-7.7 reverses half of FR-7.5's rule: a preparation is somebody's job
   * too, so it gains the seat. The ✕ stays away — a preparation is removed on
   * the row it prepares, which is the one place that shows what else that row
   * still owes.
   */
  it('gives a preparation a seat but no ✕ — it is removed where it lives', () => {
    const wrapper = mountList([preparation('Akkus laden', 'Kamera')])

    expect(wrapper.find('[data-testid="trip-todo-assign-Akkus laden"]').exists()).toBe(true)
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

/**
 * Where the tick stands. M4's packing rows put the control at the row's own
 * edge, so the thing you tap is under the thumb; a task in the same list that
 * is ticked on the far side reads as a different kind of row, and is reached
 * across the screen. Both kinds of task and both states are pinned, because
 * the open row and the resolved one are written out separately.
 */
describe('TripTodoList — the tick stands at the row edge, as a packing row does', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function rowOf(wrapper: ReturnType<typeof mountList>, body: string) {
    return wrapper.get(`[data-testid="trip-todo-${body}"]`)
  }

  /** What closes the row — the tick, past everything the end cluster carries. */
  function lastOf(row: ReturnType<typeof rowOf>) {
    const last = row.element.lastElementChild
    return { tag: last?.tagName.toLowerCase(), slot: last?.getAttribute('slot') }
  }

  it('ticks the trip’s own task at the end, past the seat and the ✕', () => {
    const wrapper = mountList([ownTask('Pflanzen giessen', 'open')])

    expect(lastOf(rowOf(wrapper, 'Pflanzen giessen'))).toEqual({ tag: 'ion-checkbox', slot: 'end' })
    expect(wrapper.findAll('ion-checkbox')).toHaveLength(1)
    expect(wrapper.find('ion-checkbox[slot="start"]').exists()).toBe(false)
  })

  it('ticks a preparation there too, past the chip of the row it belongs to', () => {
    const wrapper = mountList([preparation('Akkus laden', 'Kamera')])

    expect(lastOf(rowOf(wrapper, 'Akkus laden'))).toEqual({ tag: 'ion-checkbox', slot: 'end' })
  })

  /**
   * And it stands *beside* the cluster rather than inside it: the cluster is
   * capped at a share of the row so a chip can never push the task's own words
   * off the line, and a tick counted against that cap is paid for by the chip —
   * which rendered as a bare mark with its name clipped away (owner's eyeball
   * pass, 2026-09-20).
   */
  it('leaves the chip its width, standing beside the cluster and not in it', () => {
    const wrapper = mountList([preparation('Akkus laden', 'Kamera')])

    const cluster = rowOf(wrapper, 'Akkus laden').get('span[slot="end"]')
    expect(cluster.findAll('ion-checkbox')).toHaveLength(0)
    expect(cluster.get('[data-testid="task-item-Kamera"]').text()).toContain('Kamera')
  })

  it('unticks a finished task at the same edge, so undoing is where doing was', async () => {
    const wrapper = mountList([ownTask('Pflanzen giessen', 'resolved')])

    await wrapper.get('[data-testid="trip-todos-resolved"]').trigger('click')

    expect(lastOf(rowOf(wrapper, 'Pflanzen giessen'))).toEqual({ tag: 'ion-checkbox', slot: 'end' })
    expect(wrapper.find('ion-checkbox[slot="start"]').exists()).toBe(false)
  })

  it('still reports the tap from its new place', async () => {
    const wrapper = mountList([ownTask('Pflanzen giessen', 'open')])

    await rowOf(wrapper, 'Pflanzen giessen').get('ion-checkbox').trigger('ionChange')

    expect((wrapper.emitted('toggle') ?? []).map(([task]) => (task as TripTask).id)).toEqual([
      'Pflanzen giessen',
    ])
  })
})

/**
 * FR-7.7 on the line: the one stamp Q3 B asks for, and the way into the
 * task's own sheet.
 */
describe('TripTodoList — what a line says about itself (FR-7.7)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const written = { ...FACTS, author_id: 'u-sia', created_at: '2026-09-20T14:32:00Z' }

  /*
   * An open task is a promise, so its line says who made it; a resolved one
   * is a record, so it says who kept it. One line either way — two would
   * double the height of every row in the list to say, on the open ones,
   * nothing that is not true of all of them.
   */
  it('names who wrote an open task, and who finished a resolved one', async () => {
    const wrapper = mountList([
      { ...ownTask('Pflanzen giessen', 'open'), ...written },
      {
        ...ownTask('Kühlschrank leeren', 'resolved'),
        ...written,
        resolved_at: '2026-09-20T18:05:00Z',
        resolved_by_user_id: 'u-sia',
      },
    ])

    expect(wrapper.get('[data-testid="trip-todo-stamp-Pflanzen giessen"]').text()).toContain(
      'written by Sia',
    )
    await wrapper.get('[data-testid="trip-todos-resolved"]').trigger('click')
    expect(wrapper.get('[data-testid="trip-todo-stamp-Kühlschrank leeren"]').text()).toContain(
      'done by Sia',
    )
  })

  /*
   * G-8: Local Mode has nobody to name, and the line then states the moment
   * alone rather than inventing a person or falling silent about both.
   */
  it('keeps the moment where nobody can be named', () => {
    const wrapper = mountList(
      [{ ...ownTask('Pflanzen giessen', 'open'), ...written, author_id: 'u-nobody' }],
      false,
    )

    const stamp = wrapper.get('[data-testid="trip-todo-stamp-Pflanzen giessen"]').text()
    expect(stamp).toContain('written')
    expect(stamp).not.toContain('by')
  })

  it('says nothing where the task carries no facts at all', () => {
    const wrapper = mountList([ownTask('Pflanzen giessen', 'open')])

    expect(wrapper.find('[data-testid="trip-todo-stamp-Pflanzen giessen"]').exists()).toBe(false)
  })

  it('reports the words being tapped, so the screen can open the sheet', async () => {
    const wrapper = mountList([ownTask('Pflanzen giessen', 'open')])

    await wrapper.get('[data-testid="trip-todo-open-Pflanzen giessen"]').trigger('click')

    const opened = wrapper.emitted('open') ?? []
    expect(opened.map(([task]) => (task as TripTask).id)).toEqual(['Pflanzen giessen'])
  })

  /*
   * M4's window shows only what hangs off a packing row, so a trip task typed
   * there would be written into a list that cannot show it. The composer is
   * therefore the screen's to offer, not the list's to have.
   */
  it('offers no composer until a screen names the phase one would write', () => {
    expect(mountList([]).find('[data-testid="trip-todo-input"]').exists()).toBe(false)
    expect(
      mountList([], true, { composerPhase: 'during' })
        .find('[data-testid="trip-todo-input"]')
        .exists(),
    ).toBe(true)
  })

  it('says what an empty list means, where the screen gave it words', () => {
    const wrapper = mountList([], true, { emptyText: 'Nothing left to do before the trip.' })

    expect(wrapper.get('[data-testid="trip-todo-empty"]').text()).toBe(
      'Nothing left to do before the trip.',
    )
  })
})
