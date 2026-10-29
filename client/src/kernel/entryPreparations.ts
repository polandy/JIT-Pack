/**
 * The packing side's half of FR-29.21's contract for a day-plan entry
 * (`domain/shared/ideaBridge.ts`): an entry's preparation steps are trip tasks
 * naming the entry and a lead, so the side that owns trip tasks reads and
 * writes them, and the entry's sheet only names the entry. A projection of the
 * task rows, never a list on the entry.
 */
import { isEntryStep } from '@/domain/shared/entryPreparation'
import type { EntryPreparations } from '@/domain/shared/ideaBridge'
import { ANCHOR_KIND } from '@/domain/shared/taskAnchor'
import { taskPhaseForDue } from '@/domain/ideaResults'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations/context'
import { TASK_STATE_OPEN, TASK_STATE_RESOLVED } from '@/types/domain'
import type { IdeaPreparationReads, IdeaPreparationWrites } from './ideaPreparations'

export function createEntryPreparations(
  reads: IdeaPreparationReads,
  writes: IdeaPreparationWrites,
): EntryPreparations {
  const stepsOf = (tripId: string, entryId: string) =>
    reads.getOwnTasks(tripId).filter((task) => isEntryStep(task) && task.day_entry_id === entryId)
  const stepById = (tripId: string, stepId: string) =>
    reads.getOwnTasks(tripId).find((task) => task.id === stepId && isEntryStep(task))

  return {
    steps(tripId, entryId) {
      return stepsOf(tripId, entryId)
        .map((task) => ({
          id: task.id,
          title: task.body,
          leadDays: task.anchor_lead_days!,
          done: task.task_state === TASK_STATE_RESOLVED,
        }))
        .sort((a, b) => b.leadDays - a.leadDays)
    },
    add(tripId, entryId, title, leadDays, due) {
      const start = reads.tripList.find((trip) => trip.id === tripId)?.start_date ?? null
      writes.addOwnTask(tripId, CLIENT_ACTOR_PLACEHOLDER, title, taskPhaseForDue(due, start), {
        dayEntryId: entryId,
        anchor: { kind: ANCHOR_KIND.entry, leadDays },
      })
    },
    edit(tripId, stepId, title, leadDays) {
      const step = stepById(tripId, stepId)
      if (!step) return
      if (step.body !== title) writes.setTaskBody(step, title)
      if (step.anchor_lead_days !== leadDays) writes.setTaskLead(step, leadDays)
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
    removeAll(tripId, entryId) {
      for (const step of stepsOf(tripId, entryId)) writes.deleteOwnTask(step)
    },
  }
}
