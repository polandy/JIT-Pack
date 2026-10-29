/**
 * The bridge from an idea to the packing side (FR-29.13, ADR-078).
 *
 * An idea on the shortlist spawns an excursion, a task or a shopping entry,
 * each through the screen that already makes one, pre-filled — and the result
 * names the idea by its own `idea_id`. Two directions cross the module
 * boundary (`scripts/module-boundary-gate.mjs`), so both are contracts here
 * that the composition root (`App.vue`) binds, `dayPlanLine.ts`'s
 * arrangement:
 *
 *  - **the idea, read from the packing side** (`IdeaLookup`): what a creator
 *    is pre-filled with, and the title a result's „💡" line names;
 *  - **the results, read from the planner** (`IdeaResultSource`): the idea's
 *    *Daraus gemacht*, one source per kind of result, each a projection of
 *    its rows — never a list on the idea;
 *  - **the idea's day, written from the packing side** (`IdeaPlanWrites`):
 *    an excursion made from an idea is its line on the day plan, so deleting
 *    the excursion takes the idea's day with it (FR-29.15);
 *  - **the idea's preparation steps, read and written from the planner**
 *    (`IdeaPreparations`): each is a trip task the packing side owns, written
 *    on the idea's detail (FR-29.21);
 *  - **a day-plan entry's day and preparation steps** (`EntryLookup`,
 *    `EntryPreparations`): the same two crossings for an entry (FR-29.21).
 */

/** The three kinds of result, in the order the idea offers them. */
export const IDEA_RESULT_EXCURSION = 'excursion' as const
export const IDEA_RESULT_TASK = 'task' as const
export const IDEA_RESULT_SHOPPING = 'shopping' as const
export type IdeaResultKind =
  typeof IDEA_RESULT_EXCURSION | typeof IDEA_RESULT_TASK | typeof IDEA_RESULT_SHOPPING
export const IDEA_RESULT_KINDS: readonly IdeaResultKind[] = [
  IDEA_RESULT_EXCURSION,
  IDEA_RESULT_TASK,
  IDEA_RESULT_SHOPPING,
]

/** What a creator is pre-filled from, and what a result's origin line names. */
export interface IdeaSeed {
  id: string
  title: string
  /** The day it is planned on (FR-29.14), `YYYY-MM-DD`; null while it has none. */
  plannedOn: string | null
  /** Whether it is set aside (FR-29.2) — its preparation steps then wait again (FR-29.21). */
  dropped: boolean
}

/** The planner's answer to „which idea is this?", bound by the composition root. */
export interface IdeaLookup {
  /** Undefined for an idea this device does not hold — deleted, or not arrived yet. */
  idea(tripId: string, ideaId: string): IdeaSeed | undefined
}

/** The planner's one write the packing side asks for, bound by the composition root. */
export interface IdeaPlanWrites {
  /** Takes the idea's day and time away (FR-29.14); nothing for an idea this device does not hold. */
  unplan(tripId: string, ideaId: string): void
}

/** One result of an idea, as its *Daraus gemacht* shows it. */
export interface IdeaResult {
  /** Stable across renders and unique across every source. */
  key: string
  kind: IdeaResultKind
  title: string
  /** Whether it is through — a task ticked, an entry bought; an excursion never is. */
  done: boolean
  /** Where a tap on it leads. */
  path: string
}

/** One kind of result's rows, for one idea. */
export interface IdeaResultSource {
  results(tripId: string, ideaId: string): IdeaResult[]
}

/** One preparation step of an idea (FR-29.21), as the idea's detail lists it. */
export interface IdeaPreparation {
  id: string
  title: string
  /** Days before the idea's day it is due — one of `PREPARATION_LEADS`. */
  leadDays: number
  /** Whether it is ticked off. */
  done: boolean
}

/**
 * The packing side's answer for an idea's preparation steps (FR-29.21), bound
 * by the composition root. A step is a trip task, so the side that owns trip
 * tasks writes it; the planner only names the idea.
 */
export interface IdeaPreparations {
  /** The idea's steps, in the order they fall due — the longest lead first. */
  steps(tripId: string, ideaId: string): IdeaPreparation[]
  /**
   * Writes a step. `due` is the day it falls due as things stand, null while
   * the idea has no day — what the task's phase is written from (FR-7.7).
   */
  add(tripId: string, ideaId: string, title: string, leadDays: number, due: string | null): void
  /** Changes a step's words and lead; nothing for a step this device does not hold. */
  edit(tripId: string, stepId: string, title: string, leadDays: number): void
  /** Ticks a step off, or back on. */
  toggle(tripId: string, stepId: string): void
  remove(tripId: string, stepId: string): void
  /** Every step of the idea, removed with the idea itself. */
  removeAll(tripId: string, ideaId: string): void
}

/** A day-plan entry as the packing side reads it: the day its steps are due before. */
export interface EntrySeed {
  id: string
  title: string
  /** The day it is on, `YYYY-MM-DD`. */
  onDate: string
}

/** The planner's answer to „which entry is this?", bound by the composition root. */
export interface EntryLookup {
  /** Undefined for an entry this device does not hold — deleted, or not arrived yet. */
  entry(tripId: string, entryId: string): EntrySeed | undefined
}

/** One preparation step of a day-plan entry (FR-29.21), as the entry's sheet lists it. */
export interface EntryPreparation {
  id: string
  title: string
  /** Days before the entry's day it is due — one of `PREPARATION_LEADS`; null for a step on a day of its own. */
  leadDays: number | null
  /** The day a step without a lead is due, `YYYY-MM-DD`; null for one on a lead. */
  dueDate: string | null
  /** Whether it is ticked off. */
  done: boolean
}

/**
 * The packing side's answer for an entry's preparation steps (FR-29.21), bound
 * by the composition root: trip tasks naming the entry, written by the side
 * that owns trip tasks.
 */
export interface EntryPreparations {
  /** The entry's steps, in no order. */
  steps(tripId: string, entryId: string): EntryPreparation[]
  /**
   * Writes a step on a lead, or — with a null lead — on the day `due` itself, which then stays put
   * when the entry moves. `due` is the day it falls due, what the task's phase is written from (FR-7.7).
   */
  add(tripId: string, entryId: string, title: string, leadDays: number | null, due: string): void
  /** Changes a step's words and when, as `add` says it; nothing for a step this device does not hold. */
  edit(tripId: string, stepId: string, title: string, leadDays: number | null, due: string): void
  /** Ticks a step off, or back on. */
  toggle(tripId: string, stepId: string): void
  remove(tripId: string, stepId: string): void
  /** Every step of the entry, removed with the entry itself. */
  removeAll(tripId: string, entryId: string): void
}
