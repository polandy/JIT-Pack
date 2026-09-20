/**
 * The trip's tasks, counted and ordered. Pure — M1 reads it for the
 * *Aufgaben* section, the hero's second figure and each trip card's task
 * line; M4 for its header figure and for whether the section opens.
 *
 * Since FR-7.6 a *task* is either the trip's own (FR-7.4) or one a packing
 * row owes (FR-7.3): `tripTasks` is what puts the two in one list, and every
 * count above reads that list.
 *
 * Still deliberately apart from every packing figure (`kpis`, `unitsOf`): a
 * task counts nothing the packing list measures, so that neither a houseplant
 * nor an uncharged battery can hold a finished rucksack below 100 %.
 */
import type { ItemTodo, TodoState, TripTodo } from '@/types/domain'

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

// --- FR-7.6: one list, two kinds of task ---

/** The packing row a task prepares (FR-7.3), as a task line names it. */
export interface TripTaskItem {
  /** The `trip_items` row — what the chip leads back to. */
  id: string
  name: string
  /** The row's mark (FR-28.4), null where it has none. */
  icon: string | null
}

/**
 * One task of the trip: its own (FR-7.4) or a row's preparation (FR-7.3).
 *
 * A projection rather than the comment row itself, because the two kinds are
 * different rows with different writers, and every surface reads the same five
 * facts of them. The writers look the live row up again by `id` before they
 * write it — the undo never writes from a snapshot — so nothing here has to
 * carry one.
 */
export interface TripTask {
  /** The `comments` row (FR-7.2) this task is. */
  id: string
  body: string
  task_state: TodoState
  /** The row it prepares, or null when the task is the trip's own. */
  item: TripTaskItem | null
  /** FR-7.5: whose job it is. Only the trip's own name one. */
  assignee_user_id: string | null
}

/**
 * tripTasks puts a trip's own todos and its rows' preparations in the one
 * list FR-7.6 asks for: open first, the trip's own before a row's, a row's
 * grouped by the row and each group by text.
 *
 * A preparation whose row is not in `rows` is **left out**. That is the
 * cascade seen from the reading side: deleting a row takes its preparations
 * with it (the server cascades, §3.25), and a device that has not pulled that
 * delete yet would otherwise keep listing a task for a row it no longer shows
 * — a task nobody could reach, since the chip leads to a row that is gone.
 */
export function tripTasks(
  tripTodos: readonly TripTodo[],
  itemTodos: readonly ItemTodo[],
  rows: readonly TripTaskItem[],
): TripTask[] {
  const byId = new Map(rows.map((row) => [row.id, row]))

  const own: TripTask[] = tripTodos.map((todo) => ({
    id: todo.id,
    body: todo.body,
    task_state: todo.task_state,
    item: null,
    assignee_user_id: todo.assignee_user_id,
  }))

  const prepared: TripTask[] = []
  for (const todo of itemTodos) {
    const row = byId.get(todo.trip_item_id)
    if (!row) continue
    prepared.push({
      id: todo.id,
      body: todo.body,
      task_state: todo.task_state,
      item: row,
      // FR-7.5: a preparation names nobody — its row already does.
      assignee_user_id: null,
    })
  }

  return [...own, ...prepared].sort(compareTasks)
}

/** The order FR-7.6 states, written once because only `tripTasks` may decide it. */
function compareTasks(a: TripTask, b: TripTask): number {
  const byState = Number(a.task_state === 'resolved') - Number(b.task_state === 'resolved')
  if (byState !== 0) return byState
  const byKind = Number(a.item !== null) - Number(b.item !== null)
  if (byKind !== 0) return byKind
  if (a.item && b.item) {
    const byRow = a.item.name.localeCompare(b.item.name) || a.item.id.localeCompare(b.item.id)
    if (byRow !== 0) return byRow
  }
  return a.body.localeCompare(b.body) || a.id.localeCompare(b.id)
}
