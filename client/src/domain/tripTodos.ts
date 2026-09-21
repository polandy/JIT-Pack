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
import type { ItemTodo, TaskPhase, TaskTag, TodoState, TripTodo } from '@/types/domain'
import { TASK_PHASE_BEFORE } from '@/types/domain'

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
  /**
   * FR-7.5/FR-7.7: whose job it is. Since FR-7.7 both kinds can name
   * somebody — a task is handed over like a packing row, whether or not it
   * hangs off one.
   */
  assignee_user_id: string | null
  /**
   * FR-7.7: when it is due. Resolved here rather than carried as a nullable,
   * so the null that means *before* is read in one place instead of by every
   * surface that filters on it.
   */
  phase: TaskPhase
  /** FR-7.7: who wrote it and when — the server stamps both on insert. */
  author_id: string
  created_at: string | null
  /** FR-7.7: the resolution record; both null while the task is open. */
  resolved_at: string | null
  resolved_by_user_id: string | null
  /** FR-7.8: the one tag it carries, or null for none. */
  task_tag_id: string | null
}

/**
 * FR-7.7: the phase a stored task is in, with the null every task written
 * before FR-7.7 carries read as *before*.
 *
 * It is a reading and not a default: a task nobody has said anything about is
 * one you meant to do before you left, which is what the app asked for until
 * now. Writing the column on every old row would have claimed a statement
 * nobody made.
 */
export function taskPhaseOf(task: { phase: TaskPhase | null }): TaskPhase {
  return task.phase ?? TASK_PHASE_BEFORE
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
    ...factsOf(todo),
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
      ...factsOf(todo),
    })
  }

  return [...own, ...prepared].sort(compareTasks)
}

/**
 * FR-7.7's five facts, read the same way off both kinds of task.
 *
 * FR-7.5 used to leave a preparation's assignee null on the way through here,
 * on the grounds that its row already names somebody. The owner's 2026-09-20
 * request reverses that: a task is handed over like a pack item, and a
 * preparation is a task.
 */
function factsOf(todo: ItemTodo | TripTodo) {
  return {
    task_tag_id: todo.task_tag_id,
    assignee_user_id: todo.assignee_user_id,
    phase: taskPhaseOf(todo),
    author_id: todo.author_id,
    created_at: todo.created_at,
    resolved_at: todo.resolved_at,
    resolved_by_user_id: todo.resolved_by_user_id,
  }
}

/**
 * FR-7.7: the tasks M4 still shows — the ones that hang off a packing row and
 * are due before the trip.
 *
 * This is the *window*, and it is the whole reason nothing is filed twice:
 * M25 holds every task, M4 shows the ones you do as part of packing. Moving
 * the salve to *during* therefore takes it off the packing list, which is what
 * moving it means.
 */
export function packingWindowTasks(tasks: readonly TripTask[]): TripTask[] {
  return tasks.filter((task) => task.item !== null && task.phase === TASK_PHASE_BEFORE)
}

/** FR-7.7: the tasks of one phase, for M25's two sections. */
export function tasksInPhase(tasks: readonly TripTask[], phase: TaskPhase): TripTask[] {
  return tasks.filter((task) => task.phase === phase)
}

/**
 * FR-7.7: the *Meine* chip — the tasks handed to this person.
 *
 * Nobody signed in (Local Mode) means nobody to filter by, and the chip is
 * not offered there at all (G-8); the empty answer here is the second half of
 * that, so a caller cannot accidentally show every unassigned task as „mine".
 */
export function tasksOfAssignee(tasks: readonly TripTask[], userId: string | null): TripTask[] {
  if (!userId) return []
  return tasks.filter((task) => task.assignee_user_id === userId)
}

/** What the dashboard's task block lists, and what it says of the rest (FR-7.9). */
export interface DashboardTasks {
  /** The next few open tasks, in the order the block shows them. */
  rows: TripTask[]
  /** Every open task of the trip — the block's count. */
  open: number
  /** How many open tasks the block does not list. */
  rest: number
}

/**
 * dashboardTasks picks the tasks M1's block lists (FR-7.9): the open ones,
 * the phase in front of the trip first, and in Server Mode the tasks handed to
 * this person before the rest.
 *
 * A task has a phase and no date (FR-7.7), so there is no *overdue* to lead
 * with; the phase the trip is in is the closest thing the data has to *now*.
 * `tasks` arrives in FR-7.6's order and the sort is stable, so inside each
 * group that order stands — the block and M25 never rank two tasks
 * differently.
 */
export function dashboardTasks(
  tasks: readonly TripTask[],
  opts: { phaseInFront: TaskPhase; myUserId: string | null; limit: number },
): DashboardTasks {
  const open = tasks.filter((task) => task.task_state === 'open')
  const rank = (task: TripTask) =>
    Number(task.phase !== opts.phaseInFront) * 2 +
    Number(opts.myUserId === null || task.assignee_user_id !== opts.myUserId)
  const ordered = open
    .map((task, index) => ({ task, index }))
    .sort((a, b) => rank(a.task) - rank(b.task) || a.index - b.index)
    .map(({ task }) => task)
  const rows = ordered.slice(0, opts.limit)
  return { rows, open: open.length, rest: open.length - rows.length }
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

// --- FR-7.8: one tag, and the groups it makes ---

/**
 * Where a task with **no** tag is filed, which is not „nowhere".
 *
 * The owner asked for preparations to read under *Aus Packliste*
 * (2026-09-21). That is not a tag: as a row it could be renamed, deleted, and
 * hung on tasks that never came from a packing list, and then the heading
 * would be a lie. It is the *name of an origin* — so both kinds of untagged
 * task are `task_tag_id === null` in the data, and only the heading differs.
 */
export const TASK_ORIGIN_PREP = 'prep'
export const TASK_ORIGIN_TRIP = 'trip'
export const TASK_ORIGINS = [TASK_ORIGIN_PREP, TASK_ORIGIN_TRIP] as const
export type TaskOrigin = (typeof TASK_ORIGINS)[number]

/** One heading of M25 and the tasks under it. */
export interface TaskGroup {
  /**
   * What a drop names this group by. A tag's id, or the origin for the two
   * untagged ones — distinct from any tag id because no id is `prep`/`trip`.
   */
  key: string
  /** The tag this group is, or null where it is an origin. */
  tag: TaskTag | null
  /** Which untagged group this is, or null where it is a tag. */
  origin: TaskOrigin | null
  tasks: TripTask[]
}

/** The origin a task belongs to while it carries no tag. */
export function taskOrigin(task: Pick<TripTask, 'item'>): TaskOrigin {
  return task.item === null ? TASK_ORIGIN_TRIP : TASK_ORIGIN_PREP
}

/**
 * The tag a task is **filed under**, which is not always the tag it names.
 *
 * A task can carry an id this device does not have a tag for, and it is not
 * an exotic state: the master and trip partitions arrive through separate
 * feeds, so a task written on another device can land before the tag it
 * names — and if a tag is ever deleted, `ON DELETE SET NULL` changes the
 * server's row without passing the change log, so a device that never saw the
 * delete keeps the old id for good.
 *
 * Whatever the cause, **a task nobody can file is still a task**: it reads as
 * untagged, under the group named after where it came from, rather than
 * falling through every filter and out of the screen. Nothing is wrong with
 * it, so nothing says so — and when the tag does arrive, it simply moves to
 * the right group.
 */
export function filedTagOf(
  task: Pick<TripTask, 'task_tag_id'>,
  tags: readonly TaskTag[],
): string | null {
  if (task.task_tag_id === null) return null
  return tags.some((tag) => tag.id === task.task_tag_id) ? task.task_tag_id : null
}

/**
 * taskGroups files a phase's tasks under their headings, in reading order:
 * the tags in the order the tags themselves carry, then what came from the
 * packing list, then what has no tag and never did.
 *
 * **An empty heading is not drawn.** A group with nothing in it says nothing
 * while reading, and it is not a drop target either — losing a tag happens in
 * the task's own sheet, where it is a choice rather than a place you have to
 * find. The first build of the concept did the opposite: empty groups
 * appeared the moment a task was lifted, and the list moved under the finger
 * that had just lifted it. That is ADR-060, broken by the feature meant to
 * help.
 */
export function taskGroups(tasks: readonly TripTask[], tags: readonly TaskTag[]): TaskGroup[] {
  // Filed once, up front: every task lands in exactly one bucket, and a task
  // whose tag this device does not know lands in the untagged one rather than
  // in none. Filtering twice over the raw column — once per tag, once for
  // NULL — lets such a task match neither pass and drop off the screen.
  const filed = tasks.map((task) => ({ task, tag: filedTagOf(task, tags) }))
  const groups: TaskGroup[] = tags.map((tag) => ({
    key: tag.id,
    tag,
    origin: null,
    tasks: filed.filter((f) => f.tag === tag.id).map((f) => f.task),
  }))
  for (const origin of TASK_ORIGINS) {
    groups.push({
      key: origin,
      tag: null,
      origin,
      tasks: filed
        .filter((f) => f.tag === null && taskOrigin(f.task) === origin)
        .map((f) => f.task),
    })
  }
  return groups.filter((group) => group.tasks.length > 0)
}

/**
 * Whether a group can hold this task — which only the two origin groups ever
 * refuse. A heading that would not be true of the thing under it is worse
 * than no target at all: *Aus Packliste* over a chore of the trip would file
 * it where the next reader looks for something else.
 */
export function groupAccepts(
  group: Pick<TaskGroup, 'origin'>,
  task: Pick<TripTask, 'item'>,
): boolean {
  return group.origin === null || group.origin === taskOrigin(task)
}

/** What a drop on `key` makes the task's tag: a tag id, or none. */
export function tagForGroup(key: string): string | null {
  return (TASK_ORIGINS as readonly string[]).includes(key) ? null : key
}
