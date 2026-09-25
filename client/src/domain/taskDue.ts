/**
 * FR-7.11 — when a task is due, and what that does to where it is shown.
 *
 * A due date is a *day* (`YYYY-MM-DD`), never a moment: the owner asked for
 * a day, and a day read on the other side of a time zone must stay the same
 * day. So nothing here parses a `Date` from it — two days are compared as
 * calendar days, and „today" arrives from the caller (`orchestrator.today()`),
 * which is what keeps every rule below testable without a clock.
 *
 * The three states that matter are the ones a person acts on: **overdue**,
 * **today**, and **soon** (the next two days, owner 2026-09-25). A date
 * further out is *later* — it is shown, but it does not move anything up.
 */
import type { TodoState } from '@/types/domain'

export const DUE_OVERDUE = 'overdue'
export const DUE_TODAY = 'today'
export const DUE_SOON = 'soon'
export const DUE_LATER = 'later'
export type DueState = typeof DUE_OVERDUE | typeof DUE_TODAY | typeof DUE_SOON | typeof DUE_LATER

/** How many days ahead still count as *soon* (owner, 2026-09-25). */
export const DUE_SOON_DAYS = 2

/** What the rules read off a task. */
export interface DueFacts {
  due_date: string | null
  task_state: TodoState
}

/** The days from `today` to `day`, both `YYYY-MM-DD`; negative in the past. */
export function daysBetween(today: string, day: string): number {
  return Math.round((utcDay(day) - utcDay(today)) / MS_PER_DAY)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** A calendar day as UTC midnight — a count of days that no DST can bend. */
function utcDay(iso: string): number {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * dueStateOf reads where a task stands against today, or null where the
 * question does not arise: no date, or already done — a finished task is
 * never overdue, whatever its date says.
 */
export function dueStateOf(task: DueFacts, today: string): DueState | null {
  if (task.due_date === null || task.task_state !== 'open') return null
  const days = daysBetween(today, task.due_date)
  if (days < 0) return DUE_OVERDUE
  if (days === 0) return DUE_TODAY
  if (days <= DUE_SOON_DAYS) return DUE_SOON
  return DUE_LATER
}

/** Whether a task is one somebody should look at now: overdue, today or soon. */
export function isDuePressing(task: DueFacts, today: string): boolean {
  const state = dueStateOf(task, today)
  return state !== null && state !== DUE_LATER
}

/**
 * byDue puts the open dated tasks first, earliest date first — which reads
 * overdue, today, soon, later — and leaves everything else in the order it
 * came in (FR-7.6's). Stable, so two tasks due the same day keep that order
 * too.
 */
export function byDue<T extends DueFacts>(tasks: readonly T[], today: string): T[] {
  const rank = (task: T) =>
    dueStateOf(task, today) === null ? Number.POSITIVE_INFINITY : daysBetween(today, task.due_date!)
  return tasks
    .map((task, index) => ({ task, index, rank: rank(task) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ task }) => task)
}

/**
 * pressingFirst moves the groups holding something pressing to the top
 * (owner, 2026-09-25: a group with an overdue or soon task is shown above
 * the rest), keeping the reading order inside both halves.
 */
export function pressingFirst<G extends { tasks: readonly DueFacts[] }>(
  groups: readonly G[],
  today: string,
): G[] {
  const pressing = (group: G) => group.tasks.some((task) => isDuePressing(task, today))
  return [...groups.filter(pressing), ...groups.filter((group) => !pressing(group))]
}

/**
 * FR-7.11's in-app hint for Local Mode, which has no server to send a push:
 * how many open tasks are due by tomorrow, the overdue ones included — the
 * same two days a push would have named.
 */
export function dueByTomorrowCount(tasks: readonly DueFacts[], today: string): number {
  return tasks.filter((task) => {
    const state = dueStateOf(task, today)
    return state !== null && daysBetween(today, task.due_date!) <= 1
  }).length
}
