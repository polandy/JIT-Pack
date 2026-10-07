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

import type { Traveler } from '@/types/domain'

/** The kinds of dated row other code puts on the plan. */
export const DAY_PLAN_EXCURSION = 'excursion'
export const DAY_PLAN_TASK = 'task'
/** FR-33.5: a meal of the meal plan (§3.33). */
export const DAY_PLAN_MEAL = 'meal'
export type DayPlanLineKind =
  typeof DAY_PLAN_EXCURSION | typeof DAY_PLAN_TASK | typeof DAY_PLAN_MEAL

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
  /** The ring's name for a reader, by count — *„2 von 4 Zutaten"*, *„3 von 8 gepackt"* — where it has a progress. */
  progressName?: string
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
  /**
   * Opens the line where it is edited, over the screen it was tapped on,
   * instead of following `path` — a meal's sheet (FR-33.5).
   */
  open?: () => void
  /** Its own time, `HH:MM`, where the source knows one — a meal's (FR-33.5). */
  time?: string | null
  /**
   * Where an untimed line stands among the timed ones, `HH:MM` — a meal at
   * its slot's place (FR-33.1). Absent: after every timed line.
   */
  placeAt?: string
  /** What the time column says for such a line — the slot's word. */
  timeWord?: string
  /** The small label over the title, where the source names its kind itself — the meal's slot. */
  label?: string
  /**
   * Whom it is for, as traveller ids — an excursion narrowed to some
   * (FR-31.3), shown as the day plan's own entries show theirs (FR-29.15).
   * Absent for everybody.
   */
  travelerIds?: readonly string[]
}

/** One source of dated lines, for one trip. */
export interface DayPlanSource {
  lines(tripId: string): DayPlanLine[]
}

/** The injection key the day plan reads its sources from. */
export const DAY_PLAN_SOURCES = Symbol('dayPlanSources') as InjectionKey<readonly DayPlanSource[]>

/**
 * FR-29.15: a trip's travellers in roster order — whom an entry may be for,
 * and the names a line says it is for.
 */
export type DayPlanTravelers = (tripId: string) => Traveler[]

/** The injection key the day plan reads the trip's travellers from. */
export const DAY_PLAN_TRAVELERS = Symbol('dayPlanTravelers') as InjectionKey<DayPlanTravelers>
