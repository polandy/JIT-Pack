/**
 * Columns of a task kept out of `domain.ts` for its size: what ties a task to
 * an idea (§3.29) and the time on its due day (FR-7.18).
 */

/**
 * What a trip task carries when it belongs to an idea (§3.29): the idea it
 * was made from (FR-29.13) or whose preparation step it is (FR-29.21).
 */
export interface IdeaTaskLink {
  /** FR-29.13: the idea it was made from; null or absent for none, or one since deleted. */
  idea_id?: string | null
}

/**
 * What a trip task carries when it was materialised from a destination
 * profile's series task (FR-13.4): the series task it came from, and its
 * lead before the trip's own start (ADR-106).
 */
export interface SeriesTaskLink {
  /** FR-13.4: the series task it was materialised from; null or absent for none, or one since deleted. */
  destination_task_id?: string | null
}

/**
 * What a trip task carries when it is a day-plan entry's preparation step
 * (FR-29.21): the entry whose day it is a lead before.
 */
export interface EntryTaskLink {
  /** The entry it prepares; null or absent for none, or one since deleted. */
  day_entry_id?: string | null
}

/** What every task carries beside its due day (FR-7.18). */
export interface TaskTime {
  /**
   * The time of day its reminder arrives on that day, `HH:MM`, read in the
   * server's zone (ADR-105); null or absent for none. Only an order and a
   * push — every reading of the task stays the day's.
   */
  due_time?: string | null
}

/** What a task's due day is a lead before (ADR-108): an idea's day, a day-plan entry's, or the trip's start. */
export type AnchorKind = 'idea' | 'entry' | 'trip_start'

/**
 * The two columns of a task that is due a lead before an anchor (ADR-108):
 * an idea's or an entry's preparation step (FR-29.21), whose anchor is
 * `idea_id` or `day_entry_id`, or a series task (FR-13.4), whose anchor is the trip's own start.
 */
export interface TaskAnchorColumns {
  /** Which anchor; null or absent for an ordinary task. */
  anchor_kind?: AnchorKind | null
  /** How many days before the anchor's day it is due; null or absent for none. */
  anchor_lead_days?: number | null
}
