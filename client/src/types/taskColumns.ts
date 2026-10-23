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
  /**
   * FR-29.21: as the idea's preparation step, how many days before the idea's
   * day it is due; null or absent for an ordinary task (ADR-104).
   */
  lead_days?: number | null
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
