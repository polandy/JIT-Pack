import { describe, expect, it } from 'vitest'

import { TASK_PHASE_BEFORE, TASK_PHASE_DURING } from '@/types/domain'
import { taskDueForIdea, taskPhaseForDue } from '../ideaResults'

/*
 * FR-29.13: a task made from an idea is due the day before the idea's day, so
 * the morning reminder (FR-7.12) comes before the outing, not on it.
 */
describe('taskDueForIdea (FR-29.13)', () => {
  const today = '2026-10-02'

  it('is the day before the planned day', () => {
    expect(taskDueForIdea('2026-10-10', today)).toBe('2026-10-09')
  })

  it('counts back across a month end', () => {
    expect(taskDueForIdea('2026-11-01', today)).toBe('2026-10-31')
  })

  it('is the day itself when the day before is already past', () => {
    expect(taskDueForIdea('2026-10-02', today)).toBe('2026-10-02')
  })

  it('is no day when the idea is unplanned', () => {
    expect(taskDueForIdea(null, today)).toBeNull()
  })

  it('is no day when the planned day itself is past', () => {
    expect(taskDueForIdea('2026-09-30', today)).toBeNull()
  })
})

/*
 * FR-29.13: the task goes where its day puts it — a day on the trip is *for
 * the road*, an earlier one or none is *before the trip* (FR-7.7).
 */
describe('taskPhaseForDue (FR-29.13)', () => {
  it('is for the road from the trip’s first day on', () => {
    expect(taskPhaseForDue('2026-10-10', '2026-10-10')).toBe(TASK_PHASE_DURING)
    expect(taskPhaseForDue('2026-10-12', '2026-10-10')).toBe(TASK_PHASE_DURING)
  })

  it('is before the trip on a day before it', () => {
    expect(taskPhaseForDue('2026-10-09', '2026-10-10')).toBe(TASK_PHASE_BEFORE)
  })

  it('is before the trip without a day, or without a first day to compare with', () => {
    expect(taskPhaseForDue(null, '2026-10-10')).toBe(TASK_PHASE_BEFORE)
    expect(taskPhaseForDue('2026-10-12', null)).toBe(TASK_PHASE_BEFORE)
  })
})
