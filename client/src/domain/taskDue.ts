/**
 * FR-7.11 — when a task is due, and what that does to where it is shown.
 *
 * The day arithmetic is the kernel's (`lib/dueDay.ts`, shared with FR-30.10's
 * shopping entries); what is a task's own is which task has a day worth
 * reading — an open one. A resolved task is never overdue.
 */
import {
  DUE_LATER,
  DUE_OVERDUE,
  DUE_SOON,
  DUE_SOON_DAYS,
  DUE_TODAY,
  daysBetween,
  dueState,
  dueTally,
  isPressingDay,
  pressingGroupsFirst,
  sortByDue,
  type DueState,
  type DueTally,
} from '@/lib/dueDay'
import type { TodoState } from '@/types/domain'

export { DUE_LATER, DUE_OVERDUE, DUE_SOON, DUE_SOON_DAYS, DUE_TODAY, daysBetween }
export type { DueState }

/** What the rules read off a task. */
export interface DueFacts {
  due_date: string | null
  task_state: TodoState
}

/** The day that counts: an open task's date, and none for a finished one. */
export function openDueDay(task: DueFacts): string | null {
  return task.task_state === 'open' ? task.due_date : null
}

/**
 * dueStateOf reads where a task stands against today, or null where the
 * question does not arise: no date, or already done — a finished task is
 * never overdue, whatever its date says.
 */
export function dueStateOf(task: DueFacts, today: string): DueState | null {
  return dueState(openDueDay(task), today)
}

/** Whether a task is one somebody should look at now: overdue, today or soon. */
export function isDuePressing(task: DueFacts, today: string): boolean {
  return isPressingDay(openDueDay(task), today)
}

/**
 * byDue puts the open dated tasks first, earliest date first — which reads
 * overdue, today, soon, later — and leaves everything else in the order it
 * came in (FR-7.6's). Stable, so two tasks due the same day keep that order
 * too.
 */
export function byDue<T extends DueFacts>(tasks: readonly T[], today: string): T[] {
  return sortByDue(tasks, today, openDueDay)
}

/**
 * pressingFirst moves the groups holding something pressing to the top — a
 * group with an overdue or soon task is shown above the rest — keeping the
 * reading order inside both halves.
 */
export function pressingFirst<G extends { tasks: readonly DueFacts[] }>(
  groups: readonly G[],
  today: string,
): G[] {
  return pressingGroupsFirst(groups, (group) =>
    group.tasks.some((task) => isDuePressing(task, today)),
  )
}

/**
 * FR-7.11: the open tasks due by tomorrow — the two days the server's push
 * names — and the overdue ones among them, for M1's due line. A finished task
 * counts neither way, whatever its date says.
 */
export function taskDueTally(tasks: readonly DueFacts[], today: string): DueTally {
  return dueTally(tasks.map(openDueDay), today)
}
