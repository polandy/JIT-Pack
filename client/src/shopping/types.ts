/**
 * The shopping module's rows as the client holds them (FR-30.1, ADR-066) —
 * vocabulary of the module's own, beside its catalogue, so its domain rules
 * and its store read them without a kernel file naming them.
 */
import type { ShoppingMode } from '@/types/domain'

/**
 * FR-30.1: something a trip's people mean to buy that nobody packs — the
 * groceries of a holiday flat. Its own row rather than a trip item in a buy
 * mode, so no packing figure can count it (ADR-066). `list` is one of FR-3.2's
 * two lists; `pack` is not a shopping list.
 */
export interface ShoppingEntry {
  id: string
  trip_id: string
  name: string
  list: ShoppingMode
  bought: boolean
  /** FR-30.9: the one tag the entry carries, free text; null for none. */
  tag: string | null
  /** FR-30.4: when it was bought — the tap's time; null while it is not. */
  bought_at: string | null
  /** FR-30.4: who bought it, stamped by the server (invariant 3); null in Local Mode. */
  bought_by_user_id: string | null
  /** FR-30.10: the day it is due (`YYYY-MM-DD`), FR-7.11's shape; null for none. */
  due_date: string | null
  /** FR-30.12: who is to buy it, a task's assignee's shape (FR-7.5); null for nobody in particular. */
  assignee_user_id: string | null
  /** FR-7.16: when closing the packing carried it to *at the destination*; null or absent for never. */
  carried_over_at?: string | null
  /** FR-30.13: where it stands inside its heading, by hand; null or absent for never placed (ADR-083). */
  position?: number | null
  /** FR-29.13: the idea it was made from; null or absent for none, or one since deleted. */
  idea_id?: string | null
}
