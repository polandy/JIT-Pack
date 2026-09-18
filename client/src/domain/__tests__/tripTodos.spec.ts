import { describe, expect, it } from 'vitest'

import { tripTodoProgress, tripTodoStatus } from '../tripTodos'

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
