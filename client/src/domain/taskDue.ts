/**
 * FR-7.11 — when a task is due, and what that does to where it is shown.
 *
 * The day arithmetic is `domain/shared/dueDay.ts`'s (shared with FR-30.10's
 * shopping entries); what is a task's own is which task has a day worth
 * reading — an open one. A resolved task is never overdue. FR-7.18's time of
 * day only orders a day's tasks; every reading stays the day's.
 */
import {
  DUE_LATER,
  DUE_OVERDUE,
  DUE_SOON,
  DUE_SOON_DAYS,
  DUE_TODAY,
  dueTally,
  isPressingDay,
  pressingGroupsFirst,
  sortByDue,
  type DueState,
  type DueTally,
} from '@/domain/shared/dueDay'
import { TASK_STATE_OPEN, type TaskState } from '@/types/domain'

export { DUE_LATER, DUE_OVERDUE, DUE_SOON, DUE_SOON_DAYS, DUE_TODAY }
export type { DueState }

/** What the rules read off a task. */
export interface DueFacts {
  due_date: string | null
  /** FR-7.18: the time its reminder arrives, `HH:MM`; null or absent for none. */
  due_time?: string | null
  task_state: TaskState
}

/** The day that counts: an open task's date, and none for a finished one. */
export function openDueDay(task: DueFacts): string | null {
  return task.task_state === TASK_STATE_OPEN ? task.due_date : null
}

/** Whether a task is one somebody should look at now: overdue, today or soon. */
export function isDuePressing(task: DueFacts, today: string): boolean {
  return isPressingDay(openDueDay(task), today)
}

/**
 * byDue puts the open dated tasks first, earliest date first — which reads
 * overdue, today, soon, later — and leaves everything else in the order it
 * came in (FR-7.6's). Within a day the timed tasks lead, earliest time first
 * (FR-7.18); otherwise stable, so two tasks due the same day keep that order.
 */
export function byDue<T extends DueFacts>(tasks: readonly T[], today: string): T[] {
  return sortByDue(tasks, today, openDueDay, byDueTime)
}

/**
 * FR-7.18: two tasks due the same day, the timed one first and the earlier
 * time before the later; 0 where neither or both carry the same time.
 */
export function byDueTime(a: DueFacts, b: DueFacts): number {
  const at = a.due_time ?? null
  const bt = b.due_time ?? null
  if (at === bt) return 0
  if (at === null) return 1
  if (bt === null) return -1
  return at < bt ? -1 : 1
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
