/**
 * The contract between the day plan and the packing side's dated rows
 * (FR-29.15, ADR-066's shape for the planner).
 *
 * The day plan is the planner module's screen, and the planner may not know
 * the packing code — nor it the planner (`scripts/module-boundary-gate.mjs`).
 * Its timeline still shows the trip's excursions on their days and the tasks
 * due on one, and ticking a task there is the same write M25 makes. So the
 * packing side builds `DayPlanLine`s with the write already bound into them,
 * the composition root (`App.vue`) hands the sources to the module, and the
 * module renders lines without knowing whose they are — `shoppingSources.ts`'s
 * arrangement, for the same reason.
 *
 * **A projection, never a copy**: the line is recomputed from its row on every
 * read, so an excursion moved to another day moves on the plan too.
 */
import type { InjectionKey } from 'vue'

/** The packing side's kinds of dated row. */
export const DAY_PLAN_EXCURSION = 'excursion'
export const DAY_PLAN_TASK = 'task'
export type DayPlanLineKind = typeof DAY_PLAN_EXCURSION | typeof DAY_PLAN_TASK

/** One dated row of the packing side, as the day plan shows it. */
export interface DayPlanLine {
  /** Stable across renders and unique across every source. */
  key: string
  kind: DayPlanLineKind
  title: string
  /** The first and last day it stands on, `YYYY-MM-DD`; equal for one day. */
  from: string
  to: string
  /** The line under the title — how far an excursion's packing is. */
  detail: string | null
  /**
   * For a task: whose job it is, as a user id, or null for nobody in
   * particular. An id, so the day plan names it the way every screen does.
   */
  assignee?: string | null
  /** For an excursion: its rucksack's packed share, 0…1; null where there is nothing to pack. */
  progress: number | null
  /** For a task: whether it is done; null for a line without a tick. */
  done: boolean | null
  /** Ticks or unticks it, as M25 does; absent for a line without a tick. */
  toggle?: () => void
  /** For an excursion: its row id, which a connection names (FR-29.18). */
  refId?: string
  /** For an excursion made from an idea: that idea's id, so the plan shows both as one line (FR-29.13). */
  ideaId?: string | null
  /** Where a tap on it leads. */
  path: string
}

/** One source of dated lines, for one trip. */
export interface DayPlanSource {
  lines(tripId: string): DayPlanLine[]
}

/** The injection key the day plan reads its sources from. */
export const DAY_PLAN_SOURCES = Symbol('dayPlanSources') as InjectionKey<readonly DayPlanSource[]>
