import { describe, expect, it } from 'vitest'

import { taskBoard } from '../taskBoard'
import type { TripTask } from '../tripTodos'
import type { TaskPhase, TodoState } from '@/types/domain'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING } from '@/types/domain'

const TODAY = '2026-07-08'

function task(
  id: string,
  over: { phase?: TaskPhase; due?: string | null; state?: TodoState } = {},
): TripTask {
  return {
    id,
    body: id,
    task_state: over.state ?? 'open',
    item: null,
    assignee_user_id: null,
    phase: over.phase ?? TASK_PHASE_BEFORE,
    author_id: 'someone',
    created_at: null,
    resolved_at: null,
    resolved_by_user_id: null,
    task_tag_id: null,
    due_date: over.due ?? null,
  }
}

const ids = (tasks: readonly TripTask[]) => tasks.map((t) => t.id)

describe('taskBoard (FR-7.14)', () => {
  const tasks = [
    task('undated'),
    task('later', { due: '2026-07-20' }),
    task('tomorrow', { due: '2026-07-09' }),
    task('overdue-during', { phase: TASK_PHASE_DURING, due: '2026-07-01' }),
    task('today', { due: TODAY }),
    task('done-overdue', { due: '2026-07-01', state: 'resolved' }),
    task('road', { phase: TASK_PHASE_DURING }),
  ]

  it('collects what is pressing across both phases, earliest first', () => {
    const board = taskBoard(tasks, TODAY, { beforeLocked: false })
    expect(ids(board.due)).toEqual(['overdue-during', 'today', 'tomorrow'])
  })

  it('files every task exactly once: a pressing task leaves its phase', () => {
    const board = taskBoard(tasks, TODAY, { beforeLocked: false })
    expect(ids(board.before.open)).toEqual(['undated', 'later'])
    expect(ids(board.during.open)).toEqual(['road'])
    const all = [
      ...board.due,
      ...board.before.open,
      ...board.before.resolved,
      ...board.during.open,
      ...board.during.resolved,
    ]
    expect(ids(all).sort()).toEqual(ids(tasks).sort())
  })

  it('folds a finished task in its phase, never in the due block, whatever its date', () => {
    const board = taskBoard(tasks, TODAY, { beforeLocked: false })
    expect(ids(board.before.resolved)).toEqual(['done-overdue'])
    expect(ids(board.during.resolved)).toEqual([])
  })

  it('keeps a closed before-phase as history rather than calling its tasks due (FR-7.12)', () => {
    const board = taskBoard(tasks, TODAY, { beforeLocked: true })
    expect(ids(board.due)).toEqual(['overdue-during'])
    expect(ids(board.before.open)).toEqual(['undated', 'later', 'tomorrow', 'today'])
  })

  it('draws no due block when nothing is pressing', () => {
    expect(taskBoard([task('a'), task('b')], TODAY, { beforeLocked: false }).due).toEqual([])
  })
})
