/**
 * The packing list as a source of the shopping list (FR-30.2, ADR-066).
 *
 * The packing side of the contract in `kernel/shoppingSources.ts`: which of the
 * packing list's rows are things to buy is packing's decision (FR-3.1's
 * modes, FR-25.6's aggregation in `domain/buyRows.ts`), and so is what buying
 * one *means* — FR-3.3's transition and FR-25.11j's record, both written on
 * the packing row. The shopping module sees only the lines, with those writes
 * bound into them. It lives on this side of the boundary and is handed across
 * by `App.vue`, so neither module imports the other.
 */
import { buildBuyRows } from '@/domain/buyRows'
import { t } from '@/i18n'
import type { ShoppingLine, ShoppingSource } from '@/kernel/shoppingSources'
import type { ShoppingMode, Traveler, TripItem } from '@/types/domain'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK } from '@/types/domain'

/** What the source reads off the trip store — and nothing else. */
export interface PackingShoppingReads {
  getShoppingItems(tripId: string): {
    buyBefore: TripItem[]
    buyLocal: TripItem[]
    boughtBefore: TripItem[]
    boughtLocal: TripItem[]
  }
  getTravelers(tripId: string): Traveler[]
}

/** The two packing writes a check-off can mean (FR-3.3, FR-25.11j). */
export interface PackingShoppingWrites {
  buyItem(item: TripItem, from: ShoppingMode): void
  unbuyItem(item: TripItem, from: ShoppingMode): void
  /** FR-30.13: the row's place on the shopping list. */
  placeOnShopping(item: TripItem, position: number): void
}

/** The key prefix that keeps a packing line apart from every other source's. */
const LINE_KEY_PREFIX = 'packing:'

export function createPackingShoppingSource(
  reads: PackingShoppingReads,
  writes: PackingShoppingWrites,
): ShoppingSource {
  function linesOf(
    tripId: string,
    list: ShoppingMode,
    items: TripItem[],
    bought: boolean,
  ): ShoppingLine[] {
    return buildBuyRows(items, reads.getTravelers(tripId)).flatMap((group) =>
      group.rows.map((row) => ({
        key: LINE_KEY_PREFIX + row.key,
        name: row.name,
        quantity: row.quantity,
        recipients: row.recipients.map((traveler) => ({ id: traveler.id, name: traveler.name })),
        // FR-7.16: one instance carried is the line carried — the close
        // moves every row still to buy, so the instances agree. Only at the
        // destination: a row put back before departure on a reopened packing
        // keeps its stamp, but was carried nowhere.
        carriedOver:
          list === ITEM_MODE_BUY_LOCAL &&
          row.instances.some((item) => item.carried_over_at != null),
        // Read off the row rather than off the list: a BUY_BEFORE purchase is
        // on the packing list, a BUY_LOCAL one is packed, and a row whose
        // mode changed again since says so (FR-25.11j).
        boughtNote: bought
          ? row.instances[0]?.mode === ITEM_MODE_PACK
            ? t('shopping.wentToPacking')
            : t('shopping.wentPacked')
          : undefined,
        // FR-30.4: one act bought every instance, so the first one's record
        // is the purchase's.
        boughtAt: bought ? (row.instances[0]?.bought_at ?? null) : undefined,
        boughtBy: bought ? (row.instances[0]?.bought_by_user_id ?? null) : undefined,
        // Every instance, not the first: the line stands for all of them, and
        // one that names three people while settling one leaves two behind
        // where nobody is looking for them (FR-25.6).
        buy: () => row.instances.forEach((item) => writes.buyItem(item, list)),
        unbuy: () => row.instances.forEach((item) => writes.unbuyItem(item, list)),
        // FR-30.13: the first instance that was placed speaks for the line;
        // a move writes every instance, so they agree again after it.
        position: row.instances.find((item) => item.shopping_position != null)?.shopping_position,
        place: (position) =>
          row.instances.forEach((item) => {
            if (item.shopping_position !== position) {
              writes.placeOnShopping(item, position)
            }
          }),
      })),
    )
  }

  return {
    open(tripId, list) {
      const lists = reads.getShoppingItems(tripId)
      return linesOf(
        tripId,
        list,
        list === ITEM_MODE_BUY_BEFORE ? lists.buyBefore : lists.buyLocal,
        false,
      )
    },
    bought(tripId, list) {
      const lists = reads.getShoppingItems(tripId)
      return linesOf(
        tripId,
        list,
        list === ITEM_MODE_BUY_BEFORE ? lists.boughtBefore : lists.boughtLocal,
        true,
      )
    },
  }
}
