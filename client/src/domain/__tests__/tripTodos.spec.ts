import { describe, expect, it } from 'vitest'

import { tripTodoProgress } from '../tripTodos'

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
