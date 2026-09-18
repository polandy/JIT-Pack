/**
 * FR-7.4: the trip's own todos, counted. Pure — M1 reads it for the
 * *Aufgaben* section, the hero's second figure and each trip card's task
 * line; M4 for its header figure and for whether the section opens.
 *
 * Deliberately separate from every packing figure (`kpis`, `unitsOf`, the
 * prep KPI): a trip todo prepares no row, so a count that mixed the two
 * would let a houseplant hold a finished rucksack below 100 %.
 */
import type { TripTodo } from '@/types/domain'

/** How far a trip's todos are, as the two figures M1 states. */
export interface TripTodoProgress {
  /** Todos still open. */
  open: number
  /** Todos resolved. */
  done: number
  /** Every todo of the trip — zero means the trip has none to report. */
  total: number
}

/** tripTodoProgress counts a trip's todos by state. */
export function tripTodoProgress(todos: readonly Pick<TripTodo, 'task_state'>[]): TripTodoProgress {
  const done = todos.filter((todo) => todo.task_state === 'resolved').length
  return { open: todos.length - done, done, total: todos.length }
}

/** The two readings a trip's todos have in words, or none when it has none. */
export type TripTodoStatus = 'none' | 'open' | 'allDone'

/**
 * tripTodoStatus names which sentence a trip's todos call for. Several places
 * say it — M4's section head, M1's overview and each M1 trip card — so the
 * rule that "no todos" is silence rather than „all done" lives once.
 */
export function tripTodoStatus(progress: TripTodoProgress): TripTodoStatus {
  if (progress.total === 0) return 'none'
  return progress.open === 0 ? 'allDone' : 'open'
}

/** tripTodoPercent is the share of a trip's todos that is done, 0–100; 0 for none. */
export function tripTodoPercent(progress: TripTodoProgress): number {
  return progress.total === 0 ? 0 : (progress.done / progress.total) * 100
}

/**
 * tripTodosUnfolded says whether M4's *Aufgaben für die Reise* section is
 * open. It opens on what is still owed and folds to its one line once
 * nothing is — the section sits above the list, and a finished one should
 * give the rows their room back. A fold the user made this visit wins
 * (`fold`, null while they have not touched it).
 */
export function tripTodosUnfolded(status: TripTodoStatus, fold: boolean | null): boolean {
  return fold ?? status === 'open'
}
