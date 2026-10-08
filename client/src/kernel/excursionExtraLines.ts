/**
 * Lines of an excursion's list that another module keeps (FR-33.6): a meal
 * taken along on the outing — the picnic — stands on the rucksack's list as
 * one line, packed and unpacked there, and counts in its packed share.
 *
 * The excursion screens are the packing side's, the meal plan a module of its
 * own, and neither may import the other (`scripts/module-boundary-gate.mjs`).
 * So the module builds the lines with their writes bound in and the
 * composition root (`App.vue`) hands the sources over — `shoppingSources.ts`'s
 * arrangement. **A projection, never a copy**: nothing of it is written to
 * `excursion_items`, and it takes no part in FR-31.4's borrowing.
 */
import type { InjectionKey } from 'vue'

/** One line another module puts on an excursion's list. */
export interface ExcursionExtraLine {
  /** Stable across renders and unique across every source. */
  key: string
  /** The heading it stands under — *Essen* for a meal. */
  group: string
  title: string
  /** The line under the title, where there is one — its slot. */
  detail: string | null
  packed: boolean
  /** Packs or unpacks it. */
  toggle(): void
  /** Opens it where it is edited. */
  open(): void
}

/** One source of such lines. */
export interface ExcursionExtraSource {
  lines(tripId: string, excursionId: string): ExcursionExtraLine[]
}

/** The injection key the excursion screens read their extra sources from. */
export const EXCURSION_EXTRA_LINES = Symbol('excursionExtraLines') as InjectionKey<
  readonly ExcursionExtraSource[]
>

/** Every source's lines for one excursion. */
export function extraLinesOf(
  sources: readonly ExcursionExtraSource[],
  tripId: string,
  excursionId: string,
): ExcursionExtraLine[] {
  return sources.flatMap((source) => source.lines(tripId, excursionId))
}

/**
 * A packed share with the extra lines counted in — each one unit, as a line
 * of one thing is (FR-31.6).
 */
export function withExtraUnits(
  units: { done: number; total: number },
  extras: readonly ExcursionExtraLine[],
): { done: number; total: number } {
  return {
    done: units.done + extras.filter((line) => line.packed).length,
    total: units.total + extras.length,
  }
}
