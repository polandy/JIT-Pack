/**
 * FR-7.4: the trip's own todos, counted. Pure — M1 reads it for the
 * *Aufgaben* section and for each trip card's task line.
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
 * tripTodoStatus names which sentence a trip's todos call for. Three screens
 * say it — M4's section head, M1's overview and each M1 trip card — so the
 * rule that "no todos" is silence rather than „all done" lives once.
 */
export function tripTodoStatus(progress: TripTodoProgress): TripTodoStatus {
  if (progress.total === 0) return 'none'
  return progress.open === 0 ? 'allDone' : 'open'
}
