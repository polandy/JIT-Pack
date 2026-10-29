/**
 * FR-29.21: a day-plan entry's preparation steps — a table to reserve for a
 * dinner, tickets to buy for a visit — each a trip task due its lead before
 * the entry's day (ADR-108).
 *
 * Like an idea's step (`ideaPreparation.ts`) the due day is read off the
 * entry and never stored: the entry is moved on the planner's side, maybe on
 * another device. Unlike an idea, an entry always has its day, so a step
 * waits only while the entry is not on this device.
 */
import type { EntryTaskLink, TaskAnchorColumns } from '@/types/taskColumns'
import { ANCHOR_KIND, hasAnchor, leadBefore } from './taskAnchor'

/** What a step's due day is read from: the day its entry is on, `YYYY-MM-DD`. */
export interface EntryDay {
  onDate: string
}

/**
 * The day a step is due: its lead before the entry's day, even where that
 * lies before the trip — the step is then due all the same. None while the
 * entry is not on this device.
 */
export function entryStepDue(leadDays: number, entry: EntryDay | undefined): string | null {
  return entry ? leadBefore(entry.onDate, leadDays) : null
}

/** Whether a trip task is a day-plan entry's preparation step rather than an ordinary task. */
export function isEntryStep(task: TaskAnchorColumns & EntryTaskLink): boolean {
  return task.day_entry_id != null && hasAnchor(task, ANCHOR_KIND.entry)
}
