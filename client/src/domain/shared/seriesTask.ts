/**
 * FR-13.4: a destination profile's series tasks — the todos that come back
 * every trip of a series, due a lead before the trip's own start (ADR-106).
 *
 * The due day is read off the trip, never stored on the todo: a trip moves
 * (FR-2.1a) and a stored copy would drift across offline devices, the same
 * reasoning that keeps an idea's preparation step off its own day (ADR-104).
 * Both the task projection and the reminder query read the rule from here.
 */
import type { DestinationTask } from '@/types/domain'
import type { TaskAnchorColumns } from '@/types/taskColumns'
import { ANCHOR_KIND, hasAnchor, leadBefore } from './taskAnchor'

/**
 * The leads a series task's sheet offers, in days before the trip's start,
 * in order — FR-29.21's four leads and two longer ones, since a series
 * books further ahead than an excursion. `null` offers no due day at all.
 */
export const SERIES_TASK_LEADS = [1, 3, 7, 14, 28, 56] as const

/**
 * The day a series task is due: its lead before the trip's start. None
 * while the trip has no start date (FR-2.1a) — the todo is still an open
 * trip task, simply with no due day until the trip has one. Nothing is
 * clamped to today: a lead already past reads as overdue, ADR-104's rule
 * carried over unchanged.
 */
export function seriesTaskDue(leadDays: number, tripStartDate: string | null): string | null {
  return leadBefore(tripStartDate, leadDays)
}

/** Whether a trip task carries a series lead rather than an ordinary due day. */
export function isSeriesTask(task: TaskAnchorColumns): boolean {
  return hasAnchor(task, ANCHOR_KIND.tripStart)
}

/** One series task materialised onto a trip, the fields a new todo needs. */
export interface SeriesTaskDraft {
  destination_task_id: string
  body: string
  start_lead_days: number | null
  assignee_user_id: string | null
}

/** A materialisation's result — what to create, and what was already there. */
export interface SeriesTaskMaterialization {
  /** The todos to create — not yet on the trip by exact trimmed text. */
  toCreate: SeriesTaskDraft[]
  /** Series tasks left out because the trip already carries that text. */
  alreadyOnTrip: DestinationTask[]
}

/**
 * materializeSeriesTasks is FR-13.4's one dedup rule, read alike by the
 * wizard's and the clone's automatic materialisation (`existingTaskTexts` is
 * the template's own FR-7.4 trip tasks, not yet written) and by the
 * later-join offer sheet (`existingTaskTexts` is the trip's actual todos):
 * a series task whose exact trimmed text already appears is left out rather
 * than duplicated — FR-7.4's rule, carried over unchanged. An assignee
 * survives only when they are one of `tripMemberUserIds`; Local and
 * Single-User Mode pass none, and FR-7.5 then starts the todo unassigned,
 * the same outcome as a default assignee nobody on the trip is (G-8).
 */
export function materializeSeriesTasks(
  seriesTasks: readonly DestinationTask[],
  existingTaskTexts: readonly string[],
  tripMemberUserIds: readonly string[] = [],
): SeriesTaskMaterialization {
  const seen = new Set(existingTaskTexts.map((text) => text.trim()))
  const toCreate: SeriesTaskDraft[] = []
  const alreadyOnTrip: DestinationTask[] = []
  for (const task of seriesTasks) {
    const text = task.task.trim()
    if (text === '') continue
    if (seen.has(text)) {
      alreadyOnTrip.push(task)
      continue
    }
    seen.add(text)
    toCreate.push({
      destination_task_id: task.id,
      body: text,
      start_lead_days: task.lead_days,
      assignee_user_id:
        task.assignee_user_id && tripMemberUserIds.includes(task.assignee_user_id)
          ? task.assignee_user_id
          : null,
    })
  }
  return { toCreate, alreadyOnTrip }
}
