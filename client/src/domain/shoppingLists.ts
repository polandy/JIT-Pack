/**
 * M6's procurement lists (FR-3.2/25.11j) — pure, no I/O. `stores/tripStore`
 * is the one caller, over its own rows.
 */
import {
  ITEM_MODE_BUY_BEFORE,
  ITEM_MODE_BUY_LOCAL,
  STATE_PACKED,
  STATE_SKIPPED,
  type ShoppingMode,
  type TripItem,
} from '@/types/domain'

export interface ShoppingLists {
  buyBefore: TripItem[]
  buyLocal: TripItem[]
  boughtBefore: TripItem[]
  boughtLocal: TripItem[]
}

/**
 * shoppingLists derives the M6 procurement lists (FR-3.2): open
 * BUY_BEFORE and BUY_LOCAL items. Purchased BUY_BEFORE items flip to
 * PACK (FR-3.3) and thereby leave the list.
 *
 * Beside each open list is what was bought from it (FR-25.11j), found two
 * ways. `bought_from` is the record M6's own check-off writes, and for a
 * BUY_BEFORE row it is the only way back, because the purchase changed the
 * mode. A BUY_LOCAL purchase is different: it *is* a packing act, so the
 * ordinary FR-25.17 path records it in `state` and `packed_at` and writes
 * no `bought_from` at all — which is what a row checked off on M4 rather
 * than in the shop looks like. Reading only the column drops such a row off
 * both tabs, present in the data and on no screen.
 *
 * The two are disjoint by construction rather than by a second condition: a
 * row still on the open list is never also reported as bought, so an
 * actionable row can never hide under the reveal — the failure FR-25.11a
 * names.
 */
export function shoppingLists(items: readonly TripItem[]): ShoppingLists {
  const open = items.filter((i) => i.state !== STATE_PACKED && i.state !== STATE_SKIPPED)
  const buyBefore = open.filter((i) => i.mode === ITEM_MODE_BUY_BEFORE)
  const buyLocal = open.filter((i) => i.mode === ITEM_MODE_BUY_LOCAL)
  const stillOpen = new Set([...buyBefore, ...buyLocal].map((i) => i.id))
  // A BUY_LOCAL row that is packed and still in its own mode was bought,
  // whether or not the act that packed it went through M6.
  const packedLocally = (i: TripItem) => i.mode === ITEM_MODE_BUY_LOCAL && i.state === STATE_PACKED
  const bought = (from: ShoppingMode) =>
    items.filter(
      (i) =>
        !stillOpen.has(i.id) &&
        (i.bought_from === from || (from === ITEM_MODE_BUY_LOCAL && packedLocally(i))),
    )
  return {
    buyBefore,
    buyLocal,
    boughtBefore: bought(ITEM_MODE_BUY_BEFORE),
    boughtLocal: bought(ITEM_MODE_BUY_LOCAL),
  }
}
