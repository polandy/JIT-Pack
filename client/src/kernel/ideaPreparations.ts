/**
 * The packing side's half of FR-29.21's contract in `domain/shared/ideaBridge.ts`:
 * an idea's preparation steps are trip tasks naming the idea and a lead, so
 * the side that owns trip tasks reads and writes them, and the planner's
 * detail only names the idea. A projection of the task rows, never a list
 * on the idea.
 */
import type { IdeaPreparation, IdeaPreparations } from '@/domain/shared/ideaBridge'
import { isPreparationStep } from '@/domain/shared/ideaPreparation'
import { taskPhaseForDue } from '@/domain/ideaResults'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations/context'
import type { TaskFiling } from '@/sync/mutations/tasks'
import type { OwnTask, TaskPhase, Trip } from '@/types/domain'
import { TASK_STATE_OPEN, TASK_STATE_RESOLVED } from '@/types/domain'

/** What the steps are read from — the trip store's own tasks and its trips. */
export interface IdeaPreparationReads {
  getOwnTasks(tripId: string): OwnTask[]
  readonly tripList: readonly Pick<Trip, 'id' | 'start_date'>[]
}

/** The comment actions a step is written through, M25's own. */
export interface IdeaPreparationWrites {
  addOwnTask(
    tripId: string,
    authorId: string,
    body: string,
    phase: TaskPhase,
    filed: TaskFiling,
  ): string
  setTaskBody(task: OwnTask, body: string): void
  setTaskLead(task: OwnTask, leadDays: number): void
  resolveOwnTask(task: OwnTask): void
  reopenOwnTask(task: OwnTask): void
  deleteOwnTask(task: OwnTask): void
}

export function createIdeaPreparations(
  reads: IdeaPreparationReads,
  writes: IdeaPreparationWrites,
): IdeaPreparations {
  const stepsOf = (tripId: string, ideaId: string) =>
    reads.getOwnTasks(tripId).filter((task) => isPreparationStep(task) && task.idea_id === ideaId)
  const stepById = (tripId: string, stepId: string) =>
    reads.getOwnTasks(tripId).find((task) => task.id === stepId && isPreparationStep(task))

  return {
    steps(tripId, ideaId): IdeaPreparation[] {
      return stepsOf(tripId, ideaId)
        .map((task) => ({
          id: task.id,
          title: task.body,
          leadDays: task.lead_days!,
          done: task.task_state === TASK_STATE_RESOLVED,
        }))
        .sort((a, b) => b.leadDays - a.leadDays)
    },
    add(tripId, ideaId, title, leadDays, due) {
      const start = reads.tripList.find((trip) => trip.id === tripId)?.start_date ?? null
      writes.addOwnTask(tripId, CLIENT_ACTOR_PLACEHOLDER, title, taskPhaseForDue(due, start), {
        ideaId,
        leadDays,
      })
    },
    edit(tripId, stepId, title, leadDays) {
      const step = stepById(tripId, stepId)
      if (!step) return
      if (step.body !== title) writes.setTaskBody(step, title)
      if (step.lead_days !== leadDays) writes.setTaskLead(step, leadDays)
    },
    toggle(tripId, stepId) {
      const step = stepById(tripId, stepId)
      if (!step) return
      if (step.task_state === TASK_STATE_OPEN) writes.resolveOwnTask(step)
      else writes.reopenOwnTask(step)
    },
    remove(tripId, stepId) {
      const step = stepById(tripId, stepId)
      if (step) writes.deleteOwnTask(step)
    },
    removeAll(tripId, ideaId) {
      for (const step of stepsOf(tripId, ideaId)) writes.deleteOwnTask(step)
    },
  }
}
