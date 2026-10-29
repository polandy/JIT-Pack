/**
 * FR-29.21, FR-13.4: a task's due day as a lead before an anchor (ADR-108).
 *
 * An idea's preparation step is due its lead before the idea's day, a series
 * task its lead before the trip's start; a day-plan entry's task will be a
 * third. Every one stores the anchor's kind and the lead in days, and never a
 * due day: the anchor moves on another device, offline, in any order the
 * writes arrive (NFR-4.2a), and a stored copy would drift. The subtraction is
 * written once, here; `internal/store/taskdue.go` carries its twin for the
 * reminder, each with its test.
 */
import type { AnchorKind, TaskAnchorColumns } from '@/types/taskColumns'
import { addDays } from './calendar'

/** What a task's due day is a lead before. The server's `AnchorKind*` are the same words. */
export const ANCHOR_KIND = {
  /** The day of the idea in `idea_id` (FR-29.21). */
  idea: 'idea',
  /** The start of the task's own trip (FR-13.4). */
  tripStart: 'trip_start',
} as const satisfies Record<string, AnchorKind>

/** A new task's anchor, as the writer takes it. */
export interface TaskAnchor {
  kind: AnchorKind
  leadDays: number
}

/**
 * The day a task is due: `lead` days before the anchor's day, or none while
 * the anchor has no day. Nothing is clamped to today: a lead already past
 * reads as overdue (ADR-104).
 */
export function leadBefore(anchorDay: string | null, leadDays: number): string | null {
  if (anchorDay === null) return null
  return addDays(anchorDay, -leadDays)
}

/** Whether a task is due a lead before the given kind of anchor. */
export function hasAnchor(task: TaskAnchorColumns, kind: AnchorKind): boolean {
  return task.anchor_kind === kind && task.anchor_lead_days != null
}

/**
 * The anchor of a row stored before ADR-108. Local Mode's IndexedDB keeps
 * rows as whole objects, so one still carries `lead_days` (an idea's step) or
 * `start_lead_days` (a series task) and is read as the pair that replaced
 * them. A row with neither is an ordinary task.
 */
export function legacyAnchorOfRow(row: Record<string, unknown>): Required<TaskAnchorColumns> {
  const start = row['start_lead_days'] as number | null | undefined
  if (start != null) return { anchor_kind: ANCHOR_KIND.tripStart, anchor_lead_days: start }
  const idea = row['lead_days'] as number | null | undefined
  if (idea != null && row['idea_id'] != null) {
    return { anchor_kind: ANCHOR_KIND.idea, anchor_lead_days: idea }
  }
  return { anchor_kind: null, anchor_lead_days: null }
}

/** A series task's anchor (FR-13.4): the trip's start, or none for a series task with no lead. */
export function tripStartAnchor(leadDays: number | null): TaskAnchor | null {
  return leadDays === null ? null : { kind: ANCHOR_KIND.tripStart, leadDays }
}
