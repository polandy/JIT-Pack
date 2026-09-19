/**
 * The packing list's rows in a buy mode, as things to buy (FR-25.6) — pure,
 * no I/O, no Vue.
 *
 * This is the packing side of the shopping contract (FR-30.2, ADR-066): the
 * packing list decides what of its own is a thing to buy, and
 * `composables/packingShoppingSource.ts` hands the result to the shopping
 * module as `ShoppingLine`s. It groups by category (FR-3.2) and, within a
 * category, yields **one row per thing to buy**. A per-person item (FR-25.1) is N
 * `trip_items` rows with N quantities, and buying is a *single act*: it is
 * therefore aggregated into one row carrying the summed quantity and the
 * recipients' names, never one row per traveler — that would make the shop
 * the place where the distributing happens, which is packing's job.
 *
 * The instances travel with the row because the check-off has to settle
 * **every** one of them (FR-3.3). A row that names three people and settles
 * one is worse than three honest rows, so the aggregate is never built
 * without the set it stands for.
 */
import { perPersonKey } from './packingView'
import type { Traveler, TripItem } from '@/types/domain'

/** One line in a shopping list: a shared item, or every instance of a per-person one. */
export interface BuyRow {
  key: string
  name: string
  /** One entry for a shared item, one per recipient for a per-person item — in roster order. */
  instances: TripItem[]
  /** Summed over the instances: what to put in the basket. */
  quantity: number
  /** Who it is for, in roster order; empty on a shared row. Derived, never entered (FR-25.10). */
  recipients: Traveler[]
}

/** A category section of a shopping list. */
export interface BuyGroup {
  key: string
  /** `null` = the uncategorised bucket; the caller supplies the wording. */
  name: string | null
  rows: BuyRow[]
}

/** The uncategorised bucket's key — an absence, addressed like any other value. */
const NO_CATEGORY = ''

/**
 * buildBuyRows turns one tab's open rows into its rendered sections.
 *
 * Categories and rows keep the order they arrive in, so the list does not
 * reshuffle under a purchase; recipients and instances are put in roster
 * order, so the names read the same way everywhere on the trip.
 */
export function buildBuyRows(items: TripItem[], travelers: Traveler[]): BuyGroup[] {
  const travelerById = new Map(travelers.map((t) => [t.id, t]))
  const travelerOrder = new Map(travelers.map((t, i) => [t.id, i]))
  const groups = new Map<string, BuyGroup>()
  const rows = new Map<string, BuyRow>()

  for (const item of items) {
    const groupKey = item.category_name ?? NO_CATEGORY
    let group = groups.get(groupKey)
    if (!group) {
      group = { key: groupKey, name: item.category_name ?? null, rows: [] }
      groups.set(groupKey, group)
    }

    // Scoped by group, exactly like M4's cluster: an item is aggregated with
    // its own instances, and only with the ones on the same section.
    const rowKey = `${groupKey}::${perPersonKey(item) ?? `row:${item.id}`}`
    let row = rows.get(rowKey)
    if (!row) {
      row = { key: rowKey, name: item.name, instances: [], quantity: 0, recipients: [] }
      rows.set(rowKey, row)
      group.rows.push(row)
    }
    row.instances.push(item)
    row.quantity += item.quantity
    const traveler = item.assigned_traveler_id
      ? travelerById.get(item.assigned_traveler_id)
      : undefined
    // A row whose traveler has left the roster still counts towards the
    // amount — it is a thing to buy — it just has no name to show.
    if (traveler) row.recipients.push(traveler)
  }

  const byRoster = (a: string | null, b: string | null) =>
    (travelerOrder.get(a ?? '') ?? Number.MAX_SAFE_INTEGER) -
    (travelerOrder.get(b ?? '') ?? Number.MAX_SAFE_INTEGER)

  for (const row of rows.values()) {
    row.instances.sort((a, b) => byRoster(a.assigned_traveler_id, b.assigned_traveler_id))
    row.recipients.sort((a, b) => byRoster(a.id, b.id))
  }

  return [...groups.values()]
}
