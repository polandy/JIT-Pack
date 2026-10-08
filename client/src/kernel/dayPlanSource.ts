/**
 * The packing side's dated rows as a source of the day plan (FR-29.15).
 *
 * The packing side of the contract in `domain/dayPlanLine.ts`: each dated
 * excursion on its days with its rucksack's progress, and each task with a
 * due day on that day, its tick being M25's write. A projection, never a copy.
 */
import type { DayPlanLine, DayPlanSource } from '@/domain/dayPlanLine'
import { DAY_PLAN_EXCURSION, DAY_PLAN_TASK } from '@/domain/dayPlanLine'
import { withExtraUnits, type ExcursionExtraLine } from '@/kernel/excursionExtraLines'
import { spanOf, sumUnits } from '@/domain/excursions'
import type { TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { tripExcursionsPath, tripSubPath } from '@/router/paths'
import type {
  Excursion,
  ExcursionItem,
  ExcursionTraveler,
  ItemTodo,
  TripTodo,
} from '@/types/domain'

/** What the source reads — the trip store's excursions and the trip's tasks. */
export interface DayPlanReads {
  getExcursions(tripId: string): Excursion[]
  getExcursionItems(tripId: string): ExcursionItem[]
  /** FR-31.3: who goes on which excursion — none of an excursion's for everybody. */
  getExcursionTravelers(tripId: string): ExcursionTraveler[]
  tasksOf(tripId: string): TripTask[]
  /** Another module's lines on an excursion's list — a picnic (FR-33.6); absent for none. */
  extraLines?(tripId: string, excursionId: string): ExcursionExtraLine[]
}

/** The one write a tick on the plan means: M25's. */
export interface DayPlanWrites {
  toggleTask(tripId: string, task: TripTask): void
}

export function createDayPlanSource(reads: DayPlanReads, writes: DayPlanWrites): DayPlanSource {
  function excursionLines(tripId: string): DayPlanLine[] {
    const items = reads.getExcursionItems(tripId)
    const goers = reads.getExcursionTravelers(tripId)
    const lines: DayPlanLine[] = []
    for (const excursion of reads.getExcursions(tripId)) {
      const span = spanOf(excursion)
      if (!span) continue
      const extras = reads.extraLines?.(tripId, excursion.id) ?? []
      const units = withExtraUnits(
        sumUnits(items.filter((item) => item.excursion_id === excursion.id)),
        extras,
      )
      const packed =
        units.total > 0 ? t('excursions.packed', { done: units.done, total: units.total }) : null
      const along =
        extras.length > 0
          ? t('excursions.takenAlong', { titles: extras.map((line) => line.title).join(', ') })
          : null
      const going = goers
        .filter((row) => row.excursion_id === excursion.id)
        .map((row) => row.traveler_id)
      lines.push({
        key: `excursion:${excursion.id}`,
        ...(going.length > 0 ? { travelerIds: going } : {}),
        refId: excursion.id,
        ideaId: excursion.idea_id ?? null,
        kind: DAY_PLAN_EXCURSION,
        title: excursion.name,
        from: span.from,
        to: span.to,
        detail: [packed, along].filter((part) => !!part).join(' · ') || null,
        progress: units.total > 0 ? units.done / units.total : null,
        ...(units.total > 0
          ? { progressName: t('excursions.packedOf', { done: units.done, total: units.total }) }
          : {}),
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
  resolvePrepTodo(todo: ItemTodo): void
  reopenPrepTodo(todo: ItemTodo): void
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
    if (prep.task_state === 'open') writes.resolvePrepTodo(prep)
    else writes.reopenPrepTodo(prep)
    return
  }
  const todo = reads.getTripTodos(tripId).find((row) => row.id === task.id)
  if (!todo) return
  if (todo.task_state === 'open') writes.resolveTripTodo(todo)
  else writes.reopenTripTodo(todo)
}
