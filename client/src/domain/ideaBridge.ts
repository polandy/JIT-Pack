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
 *    its rows — never a list on the idea.
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
}

/** The planner's answer to „which idea is this?", bound by the composition root. */
export interface IdeaLookup {
  /** Undefined for an idea this device does not hold — deleted, or not arrived yet. */
  idea(tripId: string, ideaId: string): IdeaSeed | undefined
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
