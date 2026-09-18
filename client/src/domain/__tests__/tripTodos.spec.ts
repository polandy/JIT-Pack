import { describe, expect, it } from 'vitest'

import { tripTodoPercent, tripTodoProgress, tripTodoStatus, tripTodosUnfolded } from '../tripTodos'

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
