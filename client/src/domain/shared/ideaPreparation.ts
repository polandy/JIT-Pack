/**
 * FR-29.21: an idea's preparation steps — a bus to reserve, a place to book by
 * phone — each a trip task due its lead before the idea's day (ADR-104).
 *
 * The due day is read off the idea, never stored on the step: the idea is
 * planned, moved and dropped on the planner's side, and a stored copy would
 * have to be rewritten across the module boundary on every one of those
 * writes, and would drift when two devices write them offline. Both sides
 * read the rule here — the task list on the packing side, the idea's detail
 * and the day plan's sheet on the planner's.
 */
import { addDays } from './calendar'

/** The leads the step's sheet offers, in days before the idea's day, in order. */
export const PREPARATION_LEADS = [1, 3, 7, 14] as const

/** What a step's due day is read from: its idea's day, and whether it is dropped. */
export interface IdeaDay {
  /** The day the idea is planned on (FR-29.14), `YYYY-MM-DD`; null while it has none. */
  plannedOn: string | null
  /** A dropped idea's steps wait again, like an unplanned one's. */
  dropped: boolean
}

/**
 * The day a step is due: its lead before the idea's day. None while the idea
 * has no day, is dropped, or is not on this device — the step then waits on
 * the idea and is listed nowhere else.
 */
export function preparationDue(leadDays: number, idea: IdeaDay | undefined): string | null {
  if (!idea || idea.dropped || idea.plannedOn === null) return null
  return addDays(idea.plannedOn, -leadDays)
}

/** Whether a trip task is an idea's preparation step rather than an ordinary task. */
export function isPreparationStep(task: {
  idea_id?: string | null
  lead_days?: number | null
}): boolean {
  return task.idea_id != null && task.lead_days != null
}
