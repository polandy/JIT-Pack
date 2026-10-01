/**
 * FR-29.15 — the packing side's dated rows on the day plan: an excursion on
 * its days with its rucksack's progress, a task on its due day with M25's tick.
 */
import { describe, expect, it, vi } from 'vitest'

import { createDayPlanSource, toggleTask } from '../dayPlanSource'
import type { TripTask } from '@/domain/tripTodos'
import type { Excursion, ExcursionItem, ItemTodo, TripTodo } from '@/types/domain'

function excursion(id: string, startsOn: string | null, endsOn: string | null): Excursion {
  return {
    id,
    trip_id: 't',
    name: `Ausflug ${id}`,
    starts_on: startsOn,
    ends_on: endsOn,
    source_template_id: null,
  }
}

function item(id: string, packed: number, quantity: number): ExcursionItem {
  return {
    id,
    trip_id: 't',
    excursion_id: 'ex-1',
    trip_item_id: null,
    source_item_id: null,
    name: id,
    category_name: null,
    assigned_traveler_id: null,
    quantity,
    packed_count: packed,
    state: packed === quantity ? 'packed' : 'open',
    mode: 'pack',
    bought_at: null,
    not_in_luggage: false,
    for_all_participants: false,
  }
}

function task(id: string, due: string | null, state: TripTask['task_state'] = 'open'): TripTask {
  return {
    id,
    body: `Aufgabe ${id}`,
    task_state: state,
    item: null,
    assignee_user_id: 'user-sia',
    phase: 'during',
    author_id: 'user-andy',
    created_at: null,
    resolved_at: null,
    resolved_by_user_id: null,
    task_tag_id: null,
    due_date: due,
  }
}

function source(excursions: Excursion[], items: ExcursionItem[], tasks: TripTask[]) {
  const toggleTask = vi.fn()
  const src = createDayPlanSource(
    { getExcursions: () => excursions, getExcursionItems: () => items, tasksOf: () => tasks },
    { toggleTask },
  )
  return { src, toggleTask }
}

describe('the day plan source (FR-29.15)', () => {
  it('stands a dated excursion over its days with its packed share, an undated one nowhere', () => {
    const { src } = source(
      [excursion('ex-1', '2026-07-16', '2026-07-14'), excursion('ex-2', null, null)],
      [item('a', 1, 1), item('b', 0, 2)],
      [],
    )
    expect(src.lines('t')).toMatchObject([
      {
        key: 'excursion:ex-1',
        kind: 'excursion',
        from: '2026-07-14',
        to: '2026-07-16',
        progress: 1 / 3,
        path: '/trips/t/excursions/ex-1',
      },
    ])
  })

  it('puts a task on its due day, ticked where resolved, and none without a day', () => {
    const { src, toggleTask } = source(
      [],
      [],
      [task('open', '2026-07-14'), task('done', '2026-07-15', 'resolved'), task('undated', null)],
    )
    const lines = src.lines('t')
    expect(lines.map((l) => [l.key, l.from, l.done, l.assignee])).toEqual([
      ['task:open', '2026-07-14', false, 'user-sia'],
      ['task:done', '2026-07-15', true, 'user-sia'],
    ])

    lines[0]!.toggle!()
    expect(toggleTask).toHaveBeenCalledWith('t', expect.objectContaining({ id: 'open' }))
  })
})

describe('ticking a task from the day plan (FR-7.6)', () => {
  function writes() {
    return {
      resolveTripTodo: vi.fn(),
      reopenTripTodo: vi.fn(),
      resolvePrepTodo: vi.fn(),
      reopenPrepTodo: vi.fn(),
    }
  }

  it('resolves an open task of the trip’s own and reopens a resolved one, by its live row', () => {
    const w = writes()
    const live = { id: 'open', task_state: 'open' } as TripTodo
    const reads = { getTripTodos: () => [live], getItemTodos: () => [] }

    toggleTask(w, reads, 't', task('open', '2026-07-14', 'resolved'))
    expect(w.resolveTripTodo).toHaveBeenCalledWith(live)

    toggleTask(
      w,
      { ...reads, getTripTodos: () => [{ ...live, task_state: 'resolved' }] },
      't',
      task('open', null),
    )
    expect(w.reopenTripTodo).toHaveBeenCalled()
  })

  it('writes a row’s preparation through its row, and nothing for one that is gone', () => {
    const w = writes()
    const prep = { id: 'p', task_state: 'open', trip_item_id: 'row-1' } as ItemTodo
    const withItem = { ...task('p', '2026-07-14'), item: { id: 'row-1', name: 'Zelt', icon: null } }

    toggleTask(w, { getTripTodos: () => [], getItemTodos: () => [prep] }, 't', withItem)
    expect(w.resolvePrepTodo).toHaveBeenCalledWith('t', prep)

    toggleTask(w, { getTripTodos: () => [], getItemTodos: () => [] }, 't', withItem)
    expect(w.resolvePrepTodo).toHaveBeenCalledTimes(1)
  })
})
