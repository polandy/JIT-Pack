import { describe, expect, it } from 'vitest'

import {
  byDue,
  daysBetween,
  DUE_LATER,
  DUE_OVERDUE,
  DUE_SOON,
  DUE_TODAY,
  dueByTomorrowCount,
  dueStateOf,
  isDuePressing,
  pressingFirst,
  type DueFacts,
} from '../taskDue'

const TODAY = '2026-07-08'

function task(id: string, due: string | null, state: 'open' | 'resolved' = 'open') {
  return { id, due_date: due, task_state: state } satisfies DueFacts & { id: string }
}

describe('FR-7.11 daysBetween', () => {
  it.each([
    ['2026-07-08', 0],
    ['2026-07-09', 1],
    ['2026-07-01', -7],
    ['2026-08-01', 24],
    // Across the October clock change: still whole days.
    ['2026-10-26', 110],
  ])('%s is %d days from today', (day, want) => {
    expect(daysBetween(TODAY, day)).toBe(want)
  })
})

describe('FR-7.11 dueStateOf', () => {
  it.each([
    ['yesterday is overdue', '2026-07-07', DUE_OVERDUE],
    ['today', '2026-07-08', DUE_TODAY],
    ['tomorrow is soon', '2026-07-09', DUE_SOON],
    ['the day after is soon', '2026-07-10', DUE_SOON],
    ['three days out is later', '2026-07-11', DUE_LATER],
  ])('%s', (_, due, want) => {
    expect(dueStateOf(task('t', due), TODAY)).toBe(want)
  })

  it('has nothing to say about a task without a date', () => {
    expect(dueStateOf(task('t', null), TODAY)).toBeNull()
  })

  it('never calls a finished task overdue', () => {
    expect(dueStateOf(task('t', '2026-07-01', 'resolved'), TODAY)).toBeNull()
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

describe('FR-7.11 dueByTomorrowCount (Local Mode hint)', () => {
  it('counts open tasks due by tomorrow, overdue included', () => {
    const tasks = [
      task('overdue', '2026-07-01'),
      task('today', '2026-07-08'),
      task('tomorrow', '2026-07-09'),
      task('in-two-days', '2026-07-10'),
      task('undated', null),
      task('done', '2026-07-08', 'resolved'),
    ]
    expect(dueByTomorrowCount(tasks, TODAY)).toBe(3)
  })
})
