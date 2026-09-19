/**
 * The packing list as a source of the shopping list (FR-30.2, ADR-066).
 *
 * The packing side of the contract in `lib/shoppingSources.ts`: which of the
 * packing list's rows are things to buy is packing's decision (FR-3.1's
 * modes, FR-25.6's aggregation in `domain/buyRows.ts`), and so is what buying
 * one *means* — FR-3.3's transition and FR-25.11j's record, both written on
 * the packing row. The shopping module sees only the lines, with those writes
 * bound into them. It lives on this side of the boundary and is handed across
 * by `App.vue`, so neither module imports the other.
 */
import { buildBuyRows } from '@/domain/buyRows'
import { t } from '@/i18n'
import type { ShoppingLine, ShoppingSource } from '@/lib/shoppingSources'
import type { ShoppingMode, Traveler, TripItem } from '@/types/domain'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_PACK } from '@/types/domain'

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
  buyItem(tripId: string, item: TripItem, from: ShoppingMode): void
  unbuyItem(tripId: string, item: TripItem, from: ShoppingMode): void
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
        section: group.name,
        // Read off the row rather than off the list: a BUY_BEFORE purchase is
        // on the packing list, a BUY_LOCAL one is packed, and a row whose
        // mode changed again since says so (FR-25.11j).
        boughtNote: bought
          ? row.instances[0]?.mode === ITEM_MODE_PACK
            ? t('shopping.wentToPacking')
            : t('shopping.wentPacked')
          : undefined,
        // Every instance, not the first: the line stands for all of them, and
        // one that names three people while settling one leaves two behind
        // where nobody is looking for them (FR-25.6).
        buy: () => row.instances.forEach((item) => writes.buyItem(tripId, item, list)),
        unbuy: () => row.instances.forEach((item) => writes.unbuyItem(tripId, item, list)),
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
