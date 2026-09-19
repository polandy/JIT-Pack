/**
 * The contract between the shopping list and whatever feeds it (FR-30.2,
 * ADR-066).
 *
 * The shopping list is a module of its own (`client/src/shopping/`), and the
 * packing list is not allowed to know it exists — nor it the packing list
 * (`scripts/module-boundary-gate.mjs`). A packing row in a buy mode still has
 * to appear on the shopping list, and checking it off there still has to write
 * FR-3.3's transition on the packing row. This is the shape that crosses the
 * boundary: the packing side builds `ShoppingLine`s with the write already
 * bound into them, the composition root (`App.vue`) hands the source to the
 * shopping module, and the module renders lines without knowing whose they are.
 *
 * **A projection, never a copy.** The line is recomputed from the packing row
 * on every read. A copied entry would be a second truth to reconcile on every
 * quantity edit, mode change and delete — across devices, offline — and the
 * failure of that reconciliation is a thing bought twice or not at all.
 */
import type { InjectionKey } from 'vue'
import type { ShoppingMode } from '@/types/domain'

/** Who a line is for — a traveler's id and name, in roster order. */
export interface ShoppingRecipient {
  id: string
  name: string
}

/** One thing to buy, whoever it comes from. */
export interface ShoppingLine {
  /** Stable across renders and unique across every source of the list. */
  key: string
  name: string
  /** What to put in the basket; 1 where the source has no amount. */
  quantity: number
  /** Who it is for; empty where the source does not say (FR-25.6). */
  recipients: readonly ShoppingRecipient[]
  /**
   * The heading the source files it under, or null for its uncategorised
   * bucket. The list renders the headings; it never invents one.
   */
  section: string | null
  /** For a bought line: where it went, in the reader's words (FR-25.11j). */
  boughtNote?: string
  /** For a bought line: when it was bought, an ISO instant (FR-30.4). */
  boughtAt?: string | null
  /**
   * For a bought line: who bought it, as a user id (FR-30.4). An id rather
   * than a name, so the screen names it from the trip's participants the way
   * every other stamp is named, and a source never needs the directory.
   */
  boughtBy?: string | null
  /** Checks the line off — every write the purchase means, in one step. */
  buy(): void
  /** Puts a bought line back on the list it was bought from. */
  unbuy(): void
  /** Removes the line; only a line the list itself owns offers this. */
  remove?(): void
}

/** Something that contributes lines to a trip's two shopping lists. */
export interface ShoppingSource {
  /** What is still to buy on this list. */
  open(tripId: string, list: ShoppingMode): ShoppingLine[]
  /** What was bought from this list and can still be put back (FR-25.11j). */
  bought(tripId: string, list: ShoppingMode): ShoppingLine[]
}

/**
 * The sources the composition root provides. Injected rather than
 * registered in a module-level list, so a spec mounts the shopping screen
 * with the source it wants and no startup order can leave it empty.
 */
export const SHOPPING_SOURCES = Symbol('shoppingSources') as InjectionKey<readonly ShoppingSource[]>
