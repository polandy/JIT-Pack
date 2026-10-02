/**
 * A trip row's membership — traveler, container, packer, review flag — and the rows themselves:
 * added by hand, generated, cloned, imported (FR-5, FR-12, FR-16.2, FR-25.13f). Spread into
 * `createMutations` (`../mutations.ts`).
 */

import { TABLE } from '@/types/tables'
import { stateFor } from '@/domain/packState'
import type { GeneratedTripItemFields } from '@/domain/instantiate'
import { dbBool } from '@/sync/columns'
import { newId } from '@/lib/ids'
import type { Mutation } from '@/api/types'
import {
  ITEM_MODE_PACK,
  type ItemMode,
  REVIEW_FLAG_FIELD,
  type ReviewFlag,
  type ShoppingMode,
  STATE_SKIPPED,
  type TripItem,
} from '@/types/domain'
import type { MutationContext } from './context'

/**
 * FR-25.13f: a row can be born with its decision already made — the two
 * verbs the browse sheet offers. Only these two, and only as one write: an
 * insert followed by a second mutation would leave a window in which the row
 * exists undecided, and offline that window is unbounded.
 *
 * The shapes are the ones the verbs write elsewhere, so a row added this way
 * is indistinguishable from one decided a minute later: *packed* is the pack
 * mutation's (count meets quantity, `packed_at` at the tap — the server
 * stamps who), *skipped* is the skip mutation's (quantity 0).
 */
export type AddedItemDecision = 'packed' | 'skipped' | 'forgotten'

export function createTripItemsMutations({ make, nowIso }: MutationContext) {
  /**
   * FR-25.21's writer: the three fields a membership change may move, written
   * together because a conversion decides them together (ADR-036). Narrow on
   * purpose — a general "update any field" helper would be a way around the
   * named ones above, and those are what make a mutation readable in the outbox.
   */
  function setMembershipFields(
    itemId: string,
    fields: Partial<Pick<TripItem, 'assigned_traveler_id' | 'quantity' | 'packed_count' | 'state'>>,
  ): Mutation {
    return make('upsert', TABLE.tripItems, itemId, fields)
  }

  function assignTraveler(itemId: string, travelerId: string | null): Mutation {
    return make('upsert', TABLE.tripItems, itemId, { assigned_traveler_id: travelerId })
  }

  function assignContainer(itemId: string, containerId: string | null): Mutation {
    return make('upsert', TABLE.tripItems, itemId, { container_id: containerId })
  }

  function setLatePacker(itemId: string, latePacker: boolean): Mutation {
    return make('upsert', TABLE.tripItems, itemId, { late_packer: dbBool(latePacker) })
  }

  /**
   * FR-9.1 trip feedback. Setting a flag is *additive* in the merge
   * (internal/sync/merge.go) so a concurrent edit can never lose it;
   * clearing one is an ordinary last-writer-wins field, because a
   * judgement made by mistake has to be revocable.
   */
  function setReviewFlag(itemId: string, flag: ReviewFlag, value: boolean): Mutation {
    return make('upsert', TABLE.tripItems, itemId, { [REVIEW_FLAG_FIELD[flag]]: dbBool(value) })
  }

  /**
   * setPacker assigns responsibility for a row, or clears it (FR-25.19).
   *
   * This is the one actor column the client is allowed to choose:
   * `packed_by_user_id` is stamped by the server and stripped from every
   * incoming mutation, while *who is responsible* is a decision somebody
   * makes deliberately — and the server turns it into the FR-6.2
   * delegation notification.
   */
  function setPacker(itemId: string, userId: string | null): Mutation {
    return make('upsert', TABLE.tripItems, itemId, { packer_user_id: userId })
  }

  function addTripItem(
    tripId: string,
    name: string,
    opts: {
      sourceItemId?: string | null
      weightGrams?: number | null
      valueCents?: number | null
      categoryName?: string | null
      /** Defaults to one — a companion brings the dependency's own (FR-20.4). */
      quantity?: number
      flagMissing?: boolean
      mode?: ItemMode
      decided?: AddedItemDecision
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const packed = opts.decided === 'packed'
    // FR-5.11: a forgotten row is a skipped one that says why — it stayed
    // home, so it is stored as the decision *not taken* and the caller adds
    // the Missing flag that says the plan should have named it.
    const skipped = opts.decided === 'skipped' || opts.decided === 'forgotten'
    const mutation = make('insert', TABLE.tripItems, id, {
      trip_id: tripId,
      name,
      source_item_id: opts.sourceItemId ?? null,
      weight_grams: opts.weightGrams ?? null,
      value_cents: opts.valueCents ?? null,
      category_name: opts.categoryName ?? null,
      // A skip is a quantity of zero whatever was asked for (FR-5.5).
      quantity: skipped ? 0 : (opts.quantity ?? 1),
      packed_count: packed ? 1 : 0,
      state: skipped ? STATE_SKIPPED : (opts.decided ?? 'open'),
      packed_at: packed ? nowIso() : null,
      mode: opts.mode ?? ITEM_MODE_PACK,
      flag_missing: dbBool(opts.flagMissing),
    })
    return { mutation, id }
  }

  function deleteTripItem(itemId: string): Mutation {
    return make('delete', TABLE.tripItems, itemId)
  }

  /**
   * restoreTripItem puts a removed row back under its own id (FR-5.8's undo).
   *
   * The same id rather than a fresh one: the FR-27.4 ledger points at it, and
   * a row back under another id is a hand-deleted position *plus* a new row —
   * the next group refresh would read the first as a decision to keep it gone.
   * An insert newer than the tombstone is how ADR-052 lets a deliberate
   * re-creation through.
   *
   * Every field the user chose comes back; the server's stamps do not
   * (`packed_by_user_id`, `packed_at`, the G-3 claim — invariant 3). FR-5.8
   * only arms this undo for a row nothing was packed on, so there is no
   * packing record to lose.
   */
  function restoreTripItem(row: TripItem): Mutation {
    return make('insert', TABLE.tripItems, row.id, {
      trip_id: row.trip_id,
      name: row.name,
      source_item_id: row.source_item_id,
      source_template_id: row.source_template_id,
      category_name: row.category_name,
      weight_grams: row.weight_grams,
      value_cents: row.value_cents,
      quantity: row.quantity,
      packed_count: row.packed_count,
      state: row.state,
      mode: row.mode,
      late_packer: dbBool(row.late_packer),
      assigned_traveler_id: row.assigned_traveler_id,
      packer_user_id: row.packer_user_id,
      container_id: row.container_id,
      flag_unused: dbBool(row.flag_unused),
      flag_missing: dbBool(row.flag_missing),
      bought_from: row.bought_from,
    })
  }

  /**
   * addGeneratedTripItem materializes one M3 wizard result row.
   * Quantity zero means considered-and-skipped (FR-5.5), not omitted.
   */
  function addGeneratedTripItem(
    tripId: string,
    item: GeneratedTripItemFields,
    assignedTravelerId: string | null,
    // The FR-27.4 refresh supplies a *derived* id so two devices applying
    // the same group change converge on one row (ADR-016); generation
    // itself draws a fresh one.
    rowId: string = newId(),
  ): { mutation: Mutation; id: string } {
    const id = rowId
    const mutation = make('insert', TABLE.tripItems, id, {
      trip_id: tripId,
      name: item.name,
      source_item_id: item.source_item_id,
      source_template_id: item.source_template_id,
      category_name: item.category_name,
      weight_grams: item.weight_grams,
      value_cents: item.value_cents,
      quantity: item.quantity,
      packed_count: 0,
      state: item.quantity === 0 ? 'skipped' : 'open',
      mode: item.mode,
      late_packer: dbBool(item.late_packer),
      assigned_traveler_id: assignedTravelerId,
    })
    return { mutation, id }
  }

  /** addClonedTripItem inserts one FR-12 clone row — fresh pack state, remapped links. */
  function addClonedTripItem(
    tripId: string,
    item: {
      name: string
      source_item_id: string | null
      source_template_id: string | null
      category_name: string | null
      weight_grams: number | null
      value_cents: number | null
      quantity: number
      state: 'open' | 'skipped'
      mode: ItemMode
      late_packer: boolean
      packer_user_id: string | null
    },
    assignedTravelerId: string | null,
    containerId: string | null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.tripItems, id, {
      trip_id: tripId,
      name: item.name,
      source_item_id: item.source_item_id,
      source_template_id: item.source_template_id,
      category_name: item.category_name,
      weight_grams: item.weight_grams,
      value_cents: item.value_cents,
      quantity: item.quantity,
      packed_count: 0,
      state: item.state,
      mode: item.mode,
      late_packer: dbBool(item.late_packer),
      assigned_traveler_id: assignedTravelerId,
      container_id: containerId,
      packer_user_id: item.packer_user_id,
      flag_unused: 0,
      flag_missing: 0,
    })
    return { mutation, id }
  }

  /** addPortableTripItem inserts one M18 trip-import row, state derived from progress. */
  function addPortableTripItem(
    tripId: string,
    item: {
      name: string
      sourceItemId: string | null
      categoryName: string | null
      quantity: number
      packedCount: number
      mode: ItemMode
      latePacker: boolean
      /** FR-25.11j: the shopping list the row was bought from, if any. */
      boughtFrom: ShoppingMode | null
    },
    assignedTravelerId: string | null,
    containerId: string | null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const packed = Math.min(item.packedCount, item.quantity)
    const state = stateFor(packed, item.quantity)
    const mutation = make('insert', TABLE.tripItems, id, {
      trip_id: tripId,
      name: item.name,
      source_item_id: item.sourceItemId,
      category_name: item.categoryName,
      quantity: item.quantity,
      packed_count: packed,
      state,
      mode: item.mode,
      bought_from: item.boughtFrom,
      late_packer: dbBool(item.latePacker),
      assigned_traveler_id: assignedTravelerId,
      container_id: containerId,
    })
    return { mutation, id }
  }

  /** addImportedTripItem inserts one historical row with its original quantity as packed. */
  function addImportedTripItem(
    tripId: string,
    item: {
      name: string
      sourceItemId: string | null
      categoryName: string | null
      quantity: number
    },
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.tripItems, id, {
      trip_id: tripId,
      name: item.name,
      source_item_id: item.sourceItemId,
      category_name: item.categoryName,
      quantity: item.quantity,
      packed_count: item.quantity,
      state: 'packed',
      mode: ITEM_MODE_PACK,
    })
    return { mutation, id }
  }

  return {
    setMembershipFields,
    assignTraveler,
    assignContainer,
    setLatePacker,
    setReviewFlag,
    setPacker,
    addTripItem,
    deleteTripItem,
    restoreTripItem,
    addGeneratedTripItem,
    addClonedTripItem,
    addPortableTripItem,
    addImportedTripItem,
  }
}
