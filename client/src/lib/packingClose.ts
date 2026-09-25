/**
 * What a feature module does when a trip's packing is finished (FR-7.12).
 *
 * Closing the packing ends *before the trip*: the packing side moves its own
 * open tasks and its own still-to-buy rows across (`domain/closePacking`),
 * and a module that keeps things of its own in a *before* list — the
 * shopping list's own entries, first — moves them in the same act. The
 * packing list may not import a module (FR-30.3, ADR-066), so the module
 * hands it this shape through the composition root, the way it is handed
 * `lib/shoppingSources.ts` in the other direction.
 */
import type { InjectionKey } from 'vue'

/** What one crossing did, and how to take it back with the close's one undo. */
export interface CrossingEffect {
  count: number
  undo(): void
}

/** One module's share of the close. */
export interface PackingCloseCrossing {
  /** How many things closing *now* would move — the confirmation's number. */
  pending(tripId: string): number
  /** Moves them, and returns what it moved. */
  cross(tripId: string): CrossingEffect
}

/** The crossings the composition root provides. */
export const PACKING_CLOSE_CROSSINGS = Symbol('packingCloseCrossings') as InjectionKey<
  readonly PackingCloseCrossing[]
>
