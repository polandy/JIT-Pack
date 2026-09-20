import { describe, expect, it } from 'vitest'

import {
  tripTasks,
  tripTodoPercent,
  tripTodoProgress,
  tripTodoStatus,
  tripTodosUnfolded,
} from '../tripTodos'
import type { ItemTodo, TodoState, TripTodo } from '@/types/domain'

describe('tripTodoProgress (FR-7.4)', () => {
  it.each([
    { name: 'no todos', states: [], want: { open: 0, done: 0, total: 0 } },
    { name: 'all open', states: ['open', 'open'], want: { open: 2, done: 0, total: 2 } },
    {
      name: 'mixed',
      states: ['open', 'resolved', 'resolved'],
      want: { open: 1, done: 2, total: 3 },
    },
    { name: 'all done', states: ['resolved'], want: { open: 0, done: 1, total: 1 } },
  ] as const)('counts $name', ({ states, want }) => {
    expect(tripTodoProgress(states.map((task_state) => ({ task_state })))).toEqual(want)
  })
})

describe('tripTodoStatus (FR-7.4)', () => {
  it('is silent about a trip with no todos, rather than calling it done', () => {
    expect(tripTodoStatus({ open: 0, done: 0, total: 0 })).toBe('none')
  })
  it('is open while any todo is', () => {
    expect(tripTodoStatus({ open: 1, done: 2, total: 3 })).toBe('open')
  })
  it('is all done once none is open', () => {
    expect(tripTodoStatus({ open: 0, done: 2, total: 2 })).toBe('allDone')
  })
})

describe('tripTodoPercent (FR-7.4)', () => {
  it.each([
    { name: 'none done', progress: { open: 4, done: 0, total: 4 }, want: 0 },
    { name: 'one of four', progress: { open: 3, done: 1, total: 4 }, want: 25 },
    { name: 'all done', progress: { open: 0, done: 2, total: 2 }, want: 100 },
    { name: 'no todos, not a division by zero', progress: { open: 0, done: 0, total: 0 }, want: 0 },
  ])('is $want for $name', ({ progress, want }) => {
    expect(tripTodoPercent(progress)).toBe(want)
  })
})

describe('tripTodosUnfolded (FR-7.4): M4 opens the section on what is still owed', () => {
  it('is open while a todo is open, and nobody folded it', () => {
    expect(tripTodosUnfolded('open', null)).toBe(true)
  })
  it('folds to its one line once every todo is done', () => {
    expect(tripTodosUnfolded('allDone', null)).toBe(false)
  })
  it('stays shut on a trip with no todo, where it is only the way to the first one', () => {
    expect(tripTodosUnfolded('none', null)).toBe(false)
  })
  it.each([
    { status: 'open', fold: false, want: false },
    { status: 'allDone', fold: true, want: true },
    { status: 'none', fold: true, want: true },
  ] as const)(
    'follows the user over the default ($status, folded open: $fold)',
    ({ status, fold, want }) => {
      expect(tripTodosUnfolded(status, fold)).toBe(want)
    },
  )
})

describe('tripTasks (FR-7.6): one list, two kinds of task', () => {
  const row = (id: string, name: string, icon: string | null = null) => ({ id, name, icon })

  const tripTodo = (
    id: string,
    body: string,
    state: TodoState = 'open',
    assignee: string | null = null,
  ) =>
    ({
      id,
      trip_id: 'trip',
      author_id: 'someone',
      body,
      task_state: state,
      assignee_user_id: assignee,
    }) as TripTodo

  const itemTodo = (id: string, itemId: string, body: string, state: TodoState = 'open') =>
    ({
      id,
      trip_id: 'trip',
      trip_item_id: itemId,
      author_id: 'someone',
      body,
      task_state: state,
    }) as ItemTodo

  it('names the row a preparation prepares, and nothing for the trip’s own', () => {
    const tasks = tripTasks(
      [tripTodo('t1', 'Water the plants')],
      [itemTodo('p1', 'i1', 'Charge the batteries')],
      [row('i1', 'Camera', '📷')],
    )
    expect(
      tasks.map((task) => [task.body, task.item?.name ?? null, task.item?.icon ?? null]),
    ).toEqual([
      ['Water the plants', null, null],
      ['Charge the batteries', 'Camera', '📷'],
    ])
  })

  it('carries the row id, so the chip can lead back to it', () => {
    const tasks = tripTasks(
      [],
      [itemTodo('p1', 'i1', 'Charge the batteries')],
      [row('i1', 'Camera')],
    )
    expect(tasks[0]?.item?.id).toBe('i1')
  })

  it('gives a preparation no assignee, because a row already names its person (FR-7.5)', () => {
    const tasks = tripTasks([], [itemTodo('p1', 'i1', 'Charge')], [row('i1', 'Camera')])
    expect(tasks[0]?.assignee_user_id).toBeNull()
  })

  it('keeps the trip todo’s assignee (FR-7.5)', () => {
    const tasks = tripTasks([tripTodo('t1', 'Water', 'open', 'user-1')], [], [])
    expect(tasks[0]?.assignee_user_id).toBe('user-1')
  })

  /**
   * FR-7.6's cascade, read from the view side: a preparation whose row the
   * trip no longer carries is not a task of the trip any more. The server
   * cascades the delete; this is what makes the list agree with it on a
   * device that has not pulled yet.
   */
  it('drops a preparation whose row the trip no longer carries', () => {
    const tasks = tripTasks(
      [tripTodo('t1', 'Water the plants')],
      [itemTodo('p1', 'gone', 'Charge the batteries'), itemTodo('p2', 'i1', 'Wash it')],
      [row('i1', 'Jacket')],
    )
    expect(tasks.map((task) => task.body)).toEqual(['Water the plants', 'Wash it'])
  })

  it('orders open before done, the trip’s own before a row’s, then by row and text', () => {
    const tasks = tripTasks(
      [tripTodo('t1', 'Water the plants'), tripTodo('t2', 'Empty the fridge', 'resolved')],
      [
        itemTodo('p1', 'i2', 'Wash it'),
        itemTodo('p2', 'i1', 'Format the card'),
        itemTodo('p3', 'i1', 'Charge the batteries'),
        itemTodo('p4', 'i1', 'Clean the lens', 'resolved'),
      ],
      [row('i1', 'Camera'), row('i2', 'Jacket')],
    )
    expect(tasks.map((task) => task.body)).toEqual([
      'Water the plants',
      'Charge the batteries',
      'Format the card',
      'Wash it',
      'Empty the fridge',
      'Clean the lens',
    ])
  })

  it('counts both kinds in the one check the figure states', () => {
    const tasks = tripTasks(
      [tripTodo('t1', 'Water the plants', 'resolved')],
      [itemTodo('p1', 'i1', 'Charge the batteries')],
      [row('i1', 'Camera')],
    )
    expect(tripTodoProgress(tasks)).toEqual({ open: 1, done: 1, total: 2 })
  })

  it('is empty for a trip with neither kind', () => {
    expect(tripTasks([], [], [row('i1', 'Camera')])).toEqual([])
  })
})
