/**
 * The packing side's dated rows as a source of the day plan (FR-29.15).
 *
 * The packing side of the contract in `lib/dayPlanSources.ts`: each dated
 * excursion on its days with its rucksack's progress, and each task with a
 * due day on that day, its tick being M25's write. A projection, never a copy.
 */
import type { DayPlanLine, DayPlanSource } from '@/lib/dayPlanSources'
import { DAY_PLAN_EXCURSION, DAY_PLAN_TASK } from '@/lib/dayPlanSources'
import { spanOf, sumUnits } from '@/domain/excursions'
import type { TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { tripExcursionsPath, tripSubPath } from '@/router/paths'
import type { Excursion, ExcursionItem, ItemTodo, TripTodo } from '@/types/domain'

/** What the source reads — the trip store's excursions and the trip's tasks. */
export interface DayPlanReads {
  getExcursions(tripId: string): Excursion[]
  getExcursionItems(tripId: string): ExcursionItem[]
  tasksOf(tripId: string): TripTask[]
}

/** The one write a tick on the plan means: M25's. */
export interface DayPlanWrites {
  toggleTask(tripId: string, task: TripTask): void
}

export function createDayPlanSource(reads: DayPlanReads, writes: DayPlanWrites): DayPlanSource {
  function excursionLines(tripId: string): DayPlanLine[] {
    const items = reads.getExcursionItems(tripId)
    const lines: DayPlanLine[] = []
    for (const excursion of reads.getExcursions(tripId)) {
      const span = spanOf(excursion)
      if (!span) continue
      const units = sumUnits(items.filter((item) => item.excursion_id === excursion.id))
      lines.push({
        key: `excursion:${excursion.id}`,
        kind: DAY_PLAN_EXCURSION,
        title: excursion.name,
        from: span.from,
        to: span.to,
        detail:
          units.total > 0 ? t('excursions.packed', { done: units.done, total: units.total }) : null,
        progress: units.total > 0 ? units.done / units.total : null,
        done: null,
        path: tripExcursionsPath(tripId, excursion.id),
      })
    }
    return lines
  }

  function taskLines(tripId: string): DayPlanLine[] {
    return reads
      .tasksOf(tripId)
      .filter((task) => task.due_date !== null)
      .map((task) => ({
        key: `task:${task.id}`,
        kind: DAY_PLAN_TASK,
        title: task.body,
        from: task.due_date!,
        to: task.due_date!,
        detail: null,
        assignee: task.assignee_user_id,
        progress: null,
        done: task.task_state === 'resolved',
        toggle: () => writes.toggleTask(tripId, task),
        path: tripSubPath(tripId, 'tasks'),
      }))
  }

  return {
    lines: (tripId) => [...excursionLines(tripId), ...taskLines(tripId)],
  }
}

/** The task writes a tick on the plan needs — the orchestrator's, as M25 uses them. */
export interface TaskTickWrites {
  resolveTripTodo(todo: TripTodo): void
  reopenTripTodo(todo: TripTodo): void
  resolvePrepTodo(tripId: string, todo: ItemTodo): void
  reopenPrepTodo(tripId: string, todo: ItemTodo): void
}

/** The live rows a tick is written against, so the optimistic baseline is current. */
export interface TaskTickReads {
  getTripTodos(tripId: string): TripTodo[]
  getItemTodos(tripId: string, itemId: string): ItemTodo[]
}

/**
 * FR-7.6's one checkbox for two kinds of task, ticked from the day plan: the
 * live row is looked up first, as `useTaskActs.toggle` does, because the task
 * in hand is a projection of the state before the tap.
 */
export function toggleTask(
  writes: TaskTickWrites,
  reads: TaskTickReads,
  tripId: string,
  task: TripTask,
): void {
  if (task.item) {
    const prep = reads.getItemTodos(tripId, task.item.id).find((row) => row.id === task.id)
    if (!prep) return
    if (prep.task_state === 'open') writes.resolvePrepTodo(tripId, prep)
    else writes.reopenPrepTodo(tripId, prep)
    return
  }
  const todo = reads.getTripTodos(tripId).find((row) => row.id === task.id)
  if (!todo) return
  if (todo.task_state === 'open') writes.resolveTripTodo(todo)
  else writes.reopenTripTodo(todo)
}
