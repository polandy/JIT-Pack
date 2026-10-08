/**
 * A trip row's pack state: packing, skipping, buying, carrying and the packing-now claim (FR-5,
 * FR-25.11, FR-30.4). Spread into `createMutations` (`../mutations.ts`).
 */

import { TABLE } from '@/api/tables'
import { stateFor } from '@/domain/packState'
import { clampQuantity } from '@/domain/quantityChoices'
import type { Mutation } from '@/api/types'
import {
  ITEM_MODE_BUY_BEFORE,
  ITEM_MODE_BUY_LOCAL,
  ITEM_MODE_PACK,
  type ItemMode,
  type ShoppingMode,
  STATE_PACKED,
  STATE_PACKING_NOW,
} from '@/types/domain'
import { CLIENT_ACTOR_PLACEHOLDER, type MutationContext } from './context'

export function createPackStateMutations({ make, nowIso }: MutationContext) {
  // --- Trip item mutations ---

  function packItem(itemId: string, packedCount: number, state: string): Mutation {
    // Any pack-state transition releases a packing-now claim (FR-5.3).
    return make('upsert', TABLE.tripItems, itemId, {
      packed_count: packedCount,
      state,
      packing_now_by: null,
      packing_now_at: null,
      // FR-25.17: the moment of the tap, not of the push. Packing happens
      // offline and the envelope can land days later; the server keeps
      // this value when it parses and stamps its own clock otherwise.
      packed_at: state === 'packed' ? nowIso() : null,
    })
  }

  /**
   * startPackingNow claims the item (FR-5.2). The server stamps the
   * real locker (FR-4.2); the timestamp feeds the §7 staleness rule.
   */
  function startPackingNow(itemId: string): Mutation {
    return make('upsert', TABLE.tripItems, itemId, {
      state: STATE_PACKING_NOW,
      packing_now_by: CLIENT_ACTOR_PLACEHOLDER,
      packing_now_at: nowIso(),
    })
  }

  /**
   * releasePackingNow gives the claim back without packing anything
   * (FR-5.3). The state is derived from the count for the same reason
   * `incrementPacked` derives it: the claim overwrote whatever was there,
   * and the count is what actually says how far the row got.
   */
  function releasePackingNow(itemId: string, packedCount: number, quantity: number): Mutation {
    return make('upsert', TABLE.tripItems, itemId, {
      state: stateFor(packedCount, quantity),
      packing_now_by: null,
      packing_now_at: null,
    })
  }

  function incrementPacked(itemId: string, currentPacked: number, quantity: number): Mutation {
    const newPacked = Math.min(currentPacked + 1, quantity)
    return packItem(itemId, newPacked, stateFor(newPacked, quantity))
  }

  function decrementPacked(itemId: string, currentPacked: number, quantity: number): Mutation {
    const newPacked = Math.max(currentPacked - 1, 0)
    return packItem(itemId, newPacked, stateFor(newPacked, quantity))
  }

  function completePacked(itemId: string, quantity: number): Mutation {
    return packItem(itemId, quantity, 'packed')
  }

  function zeroPacked(itemId: string): Mutation {
    return packItem(itemId, 0, 'open')
  }

  function togglePacked(itemId: string, currentPacked: number): Mutation {
    return currentPacked > 0 ? packItem(itemId, 0, 'open') : packItem(itemId, 1, 'packed')
  }

  /**
   * setQuantity writes the planned amount of a row (FR-25.24).
   *
   * Three fields, always together, because the database ties them: the
   * schema's `CHECK (packed_count <= quantity)` means an amount cut below
   * what is already packed is a refused row rather than a smaller one, so
   * the count is clamped in the same mutation and the state re-read off
   * the two numbers (`stateFor`).
   *
   * The one state it does not write is G-3's claim: somebody is holding
   * the row, and a change of amount is not a pack transition, so the claim
   * outlives it rather than being released by a bystander's edit.
   */
  function setQuantity(
    itemId: string,
    quantity: number,
    currentPacked: number,
    currentState: string,
  ): Mutation {
    const wanted = clampQuantity(quantity)
    const packed = Math.min(Math.max(currentPacked, 0), wanted)
    return make('upsert', TABLE.tripItems, itemId, {
      quantity: wanted,
      packed_count: packed,
      ...(currentState === STATE_PACKING_NOW ? {} : { state: stateFor(packed, wanted) }),
    })
  }

  function skipItem(itemId: string): Mutation {
    return make('upsert', TABLE.tripItems, itemId, {
      quantity: 0,
      packed_count: 0,
      state: 'skipped',
    })
  }

  /**
   * FR-5.10's close, on a row nothing was packed of: FR-5.5's skip, plus the
   * release of a claim (FR-5.3).
   *
   * The release is what separates it from {@link skipItem}. That one is a
   * decision about the row under the finger, and M4 does not offer it on a
   * row somebody else is holding; the close reaches every open row at once —
   * the G-3 lock is advisory — and a decided row must not still read
   * „Sonja packt gerade".
   */
  function closeRowUnpacked(itemId: string): Mutation {
    const skip = skipItem(itemId)
    return { ...skip, fields: { ...skip.fields, packing_now_by: null, packing_now_at: null } }
  }

  /**
   * FR-5.10's close, on a half-packed row: the amount shrinks to what is in
   * the bag (variant P1), so the row reads as packed.
   *
   * Deliberately **not** the skip: four of six socks travelled, and writing
   * quantity 0 would deny them — M14 would lose four packed rows it could
   * have judged, and the bag would disagree with the list. Equally
   * deliberately not {@link packItem}: nothing was packed at this moment, so
   * `packed_at` keeps saying when the four actually went in.
   */
  function closeRowPartlyPacked(itemId: string, packedCount: number): Mutation {
    return make('upsert', TABLE.tripItems, itemId, {
      quantity: packedCount,
      packed_count: packedCount,
      state: STATE_PACKED,
      packing_now_by: null,
      packing_now_at: null,
    })
  }

  /**
   * restoreSkipped puts a row back the way a skip found it (FR-5.5's undo).
   *
   * Deliberately not `packItem`: that one stamps `packed_at` and clears the
   * packing-now claim, and an undo of "do not pack this" must record no
   * packing at all. It writes exactly the three fields {@link skipItem}
   * changed, and nothing else.
   */
  function restoreSkipped(
    itemId: string,
    quantity: number,
    packedCount: number,
    state: string,
  ): Mutation {
    return make('upsert', TABLE.tripItems, itemId, {
      quantity,
      packed_count: packedCount,
      state,
    })
  }

  function unskipItem(itemId: string): Mutation {
    return make('upsert', TABLE.tripItems, itemId, {
      quantity: 1,
      packed_count: 0,
      state: 'open',
    })
  }

  /**
   * buyItem checks a row off one of M6's shopping lists (FR-3.3, FR-25.11j).
   *
   * `bought_from` travels in the *same* upsert as the change it explains.
   * Buying a BUY_BEFORE row moves it to the packing list, so the record of
   * where it came from is the only way back — and a second mutation carrying
   * it would leave a window (offline, an unbounded one) in which the row has
   * left the shopping side with nothing saying which list it left.
   */
  function buyItem(itemId: string, from: ShoppingMode, quantity: number): Mutation {
    // FR-30.4: the moment of the tap travels with the purchase; the server
    // stamps who (invariant 3) and keeps this time, as for `packed_at`.
    const purchase = { bought_from: from, bought_at: nowIso() }
    if (from === ITEM_MODE_BUY_LOCAL) {
      // Bought at the destination: that is its packed state, and the mode
      // stays what it was — the row never leaves its own list.
      const packed = packItem(itemId, quantity, 'packed')
      return { ...packed, fields: { ...purchase, ...packed.fields } }
    }
    return make('upsert', TABLE.tripItems, itemId, { ...purchase, mode: ITEM_MODE_PACK })
  }

  /**
   * unbuyItem is FR-25.11j's undo: the row goes back on the list it was
   * bought from, and the record that sent it there is cleared with it.
   */
  /**
   * FR-30.13: where the row's line stands inside its heading on the shopping
   * list, by hand (ADR-083). One field: nothing about the packing changes.
   */
  function placeOnShopping(itemId: string, position: number): Mutation {
    return make('upsert', TABLE.tripItems, itemId, { shopping_position: position })
  }

  function unbuyItem(itemId: string, from: ShoppingMode): Mutation {
    // FR-30.4: the record goes with the purchase it described.
    const cleared = { bought_from: null, bought_at: null, bought_by_user_id: null }
    if (from === ITEM_MODE_BUY_LOCAL) {
      const unpacked = packItem(itemId, 0, 'open')
      return { ...unpacked, fields: { ...cleared, ...unpacked.fields } }
    }
    return make('upsert', TABLE.tripItems, itemId, { ...cleared, mode: from })
  }

  function setItemMode(itemId: string, mode: ItemMode): Mutation {
    return make('upsert', TABLE.tripItems, itemId, { mode })
  }

  /**
   * FR-7.12/FR-7.16: the close carries a row still to buy *before
   * departure* to *at the destination*, and says when — one write, so the
   * mark never stands on a row that did not move.
   */
  function carryRowToLocal(itemId: string, at: string): Mutation {
    return make('upsert', TABLE.tripItems, itemId, {
      mode: ITEM_MODE_BUY_LOCAL,
      carried_over_at: at,
    })
  }

  /** The close's undo for {@link carryRowToLocal}: back before departure, unmarked. */
  function returnCarriedRow(itemId: string): Mutation {
    return make('upsert', TABLE.tripItems, itemId, {
      mode: ITEM_MODE_BUY_BEFORE,
      carried_over_at: null,
    })
  }

  return {
    packItem,
    startPackingNow,
    releasePackingNow,
    incrementPacked,
    decrementPacked,
    completePacked,
    zeroPacked,
    togglePacked,
    setQuantity,
    skipItem,
    closeRowUnpacked,
    closeRowPartlyPacked,
    restoreSkipped,
    unskipItem,
    buyItem,
    placeOnShopping,
    unbuyItem,
    setItemMode,
    carryRowToLocal,
    returnCarriedRow,
  }
}
