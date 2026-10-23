import { describe, expect, it } from 'vitest'

import { dueState } from '../shared/dueDay'
import {
  taskDueTally,
  byDue,
  DUE_LATER,
  DUE_OVERDUE,
  DUE_SOON,
  DUE_TODAY,
  isDuePressing,
  openDueDay,
  pressingFirst,
  type DueFacts,
} from '../taskDue'

const TODAY = '2026-07-08'

function task(id: string, due: string | null, state: 'open' | 'resolved' = 'open') {
  return { id, due_date: due, task_state: state } satisfies DueFacts & { id: string }
}

describe('FR-7.11 a task’s due state', () => {
  it.each([
    ['yesterday is overdue', '2026-07-07', DUE_OVERDUE],
    ['today', '2026-07-08', DUE_TODAY],
    ['tomorrow is soon', '2026-07-09', DUE_SOON],
    ['the day after is soon', '2026-07-10', DUE_SOON],
    ['three days out is later', '2026-07-11', DUE_LATER],
  ])('%s', (_, due, want) => {
    expect(dueState(openDueDay(task('t', due)), TODAY)).toBe(want)
  })

  it('has nothing to say about a task without a date', () => {
    expect(dueState(openDueDay(task('t', null)), TODAY)).toBeNull()
  })

  it('never calls a finished task overdue', () => {
    expect(dueState(openDueDay(task('t', '2026-07-01', 'resolved')), TODAY)).toBeNull()
  })

  it('counts only overdue, today and soon as pressing', () => {
    expect(isDuePressing(task('t', '2026-07-10'), TODAY)).toBe(true)
    expect(isDuePressing(task('t', '2026-07-11'), TODAY)).toBe(false)
    expect(isDuePressing(task('t', null), TODAY)).toBe(false)
  })
})

describe('FR-7.11 byDue', () => {
  it('puts dated open tasks first, earliest first, and keeps the rest in their order', () => {
    const tasks = [
      task('undated-a', null),
      task('later', '2026-07-20'),
      task('done-overdue', '2026-07-01', 'resolved'),
      task('soon', '2026-07-10'),
      task('undated-b', null),
      task('overdue', '2026-07-05'),
      task('today', '2026-07-08'),
    ]
    expect(byDue(tasks, TODAY).map((t) => t.id)).toEqual([
      'overdue',
      'today',
      'soon',
      'later',
      'undated-a',
      'done-overdue',
      'undated-b',
    ])
  })

  it('keeps the incoming order between two tasks due the same day', () => {
    const tasks = [task('b', '2026-07-09'), task('a', '2026-07-09')]
    expect(byDue(tasks, TODAY).map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('FR-7.18 byDue within one day', () => {
  const timed = (
    id: string,
    due: string,
    time: string | null,
    state: 'open' | 'resolved' = 'open',
  ) => ({
    ...task(id, due, state),
    due_time: time,
  })

  it('puts the timed tasks of a day first, earliest time first, ahead of the untimed', () => {
    const tasks = [
      timed('untimed', '2026-07-08', null),
      timed('afternoon', '2026-07-08', '14:00'),
      timed('tomorrow-early', '2026-07-09', '07:00'),
      timed('morning', '2026-07-08', '09:30'),
    ]
    expect(byDue(tasks, TODAY).map((t) => t.id)).toEqual([
      'morning',
      'afternoon',
      'untimed',
      'tomorrow-early',
    ])
  })

  it('never lets a time outrank the day', () => {
    const tasks = [timed('tomorrow', '2026-07-09', '06:00'), timed('today', '2026-07-08', '23:00')]
    expect(byDue(tasks, TODAY).map((t) => t.id)).toEqual(['today', 'tomorrow'])
  })
})

describe('FR-7.11 pressingFirst', () => {
  it('moves the groups with something pressing to the top, order kept in both halves', () => {
    const groups = [
      { key: 'quiet', tasks: [task('q', null)] },
      { key: 'later', tasks: [task('l', '2026-07-30')] },
      { key: 'soon', tasks: [task('s', '2026-07-09')] },
      { key: 'done', tasks: [task('d', '2026-07-01', 'resolved')] },
      { key: 'overdue', tasks: [task('o', '2026-07-01'), task('x', null)] },
    ]
    expect(pressingFirst(groups, TODAY).map((g) => g.key)).toEqual([
      'soon',
      'overdue',
      'quiet',
      'later',
      'done',
    ])
  })
})

describe('FR-7.11 taskDueTally (M1’s due line)', () => {
  it('counts open tasks due by tomorrow, and the overdue apart', () => {
    const tasks = [
      task('overdue', '2026-07-01'),
      task('today', '2026-07-08'),
      task('tomorrow', '2026-07-09'),
      task('in-two-days', '2026-07-10'),
      task('undated', null),
      task('done', '2026-07-08', 'resolved'),
    ]
    expect(taskDueTally(tasks, TODAY)).toEqual({ due: 3, overdue: 1 })
  })
})
