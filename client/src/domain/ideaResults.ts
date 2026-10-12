/**
 * FR-29.13: the packing side's rules for a result made from an idea.
 */
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING, type TaskPhase } from '@/types/domain'

import { addDays } from './shared/calendar'

/**
 * The due day a task made from an idea is offered: the day before the idea's
 * day, so the morning reminder (FR-7.12) comes before the outing rather than
 * on it — the day itself where the day before is gone, and none for an idea
 * without a day or one whose day is past. Days are `YYYY-MM-DD`, compared as
 * strings.
 */
export function taskDueForIdea(plannedOn: string | null, today: string): string | null {
  if (plannedOn === null || plannedOn < today) return null
  const before = addDays(plannedOn, -1)
  return before < today ? plannedOn : before
}

/**
 * The phase a task made from an idea is written in: *for the road* when it is
 * due on one of the trip's days, *before the trip* otherwise (FR-7.7) — a
 * booking due on the second day of the holiday is not a task for before it.
 */
export function taskPhaseForDue(due: string | null, tripStart: string | null): TaskPhase {
  return due !== null && tripStart !== null && due >= tripStart
    ? TASK_PHASE_DURING
    : TASK_PHASE_BEFORE
}
