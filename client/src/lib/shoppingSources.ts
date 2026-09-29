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
   * The tag the line carries (FR-30.9); null or absent for none. Only the
   * list's own entries have one — a packing line is filed by its category.
   */
  tag?: string | null
  /**
   * The heading a source files this line under, instead of the one combined
   * heading every source shares (FR-31.8): an excursion's lines are bought
   * for that outing, and read under its name. Absent for the packing list's.
   */
  section?: string | null
  /**
   * FR-7.16: the close of the packing carried the line here from *before
   * departure*. Filed under *Von vor der Abreise* where nothing files it more
   * precisely — a tag of its own or a source's own heading.
   */
  carriedOver?: boolean
  /**
   * The day an open line is due (FR-30.10), `YYYY-MM-DD`; null or absent for
   * none — and for a bought line, which is never overdue. Only the list's own
   * entries carry one: a packing line's moment is the list it sits on.
   */
  dueDate?: string | null
  /**
   * Who is to buy the line (FR-30.12), as a user id; null for nobody in
   * particular. Absent where the source does not hand lines over — a packing
   * line's person is the packing list's to name, and one line may stand for
   * rows of several people.
   */
  assignee?: string | null
  /**
   * Where the line stands inside its heading, by hand (FR-30.13); null or
   * absent for never placed, which reads before every placed line (ADR-083).
   */
  position?: number | null
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
  /**
   * Puts the line at `position` inside its heading (FR-30.13) — written on
   * whatever the line stands for, every row of it where it stands for
   * several. Every source offers it: a line's place is the list's to set,
   * whoever the line belongs to.
   */
  place(position: number): void
  /** Removes the line; only a line the list itself owns offers this. */
  remove?(): void
  /**
   * Changes the line's name, tag (FR-30.9) and/or due day (FR-30.10); only a
   * line the list owns offers this. What did not change is not written, so
   * two people editing different fields of one entry do not overwrite each
   * other — and a `dueDate` left out is not a change either.
   */
  edit?(fields: { name: string; tag: string | null; dueDate?: string | null }): void
  /** Hands the line to somebody, or to nobody with null (FR-30.12); only a line the list owns offers this. */
  assign?(userId: string | null): void
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
