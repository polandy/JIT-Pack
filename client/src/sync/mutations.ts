/**
 * Mutation factory — creates properly shaped Mutation objects for common
 * packing-list actions. Every mutation gets a unique ID and the current HLC.
 *
 * All writes go through these helpers → SyncOutbox → server (P-2, G-5).
 *
 * It sits in the sync layer rather than among the composables because it is
 * neither: it touches no reactivity, and it is called from the CLI and named
 * by `domain/portableImport.ts`, which may not reach up into a caller's layer
 * (invariant 4). The `use` prefix it carried said otherwise.
 */

import { TABLE } from '@/types/tables'
import { stateFor } from '@/domain/packState'
import { clampQuantity } from '@/domain/quantityChoices'
import type { GeneratedTripItemFields } from '@/domain/instantiate'
import { dbBool, jsonColumn, rowFrom } from '@/sync/columns'
import { newId } from '@/lib/ids'
import type { Mutation, MutationOp } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'
import { defaultNowIso, type NowIso } from '@/lib/clock'
import {
  ITEM_MODE_BUY_LOCAL,
  ITEM_MODE_PACK,
  REVIEW_FLAG_FIELD,
  STATE_PACKED,
  STATE_PACKING_NOW,
  TRIP_STATUS_ARCHIVED,
  TRIP_STATUS_PLANNING,
} from '@/types/domain'

import { STATE_SKIPPED, type Trip } from '@/types/domain'
import type {
  AppliedChange,
  Container,
  DestinationChecklistItem,
  DestinationProfile,
  ItemDependency,
  GeneratedPosition,
  ItemMode,
  ReviewFlag,
  ShoppingMode,
  TaskPhase,
  MasterItem,
  Template,
  TemplateItem,
  TemplateKind,
  TripItem,
  TripSeries,
  TripStatus,
} from '@/types/domain'

/**
 * What the client writes into an actor column it is not allowed to decide.
 * The server stamps those columns itself — `comments.author_id` and
 * `packing_now_by` among them (`stampActor`, invariant 3) — so the placeholder
 * never reaches a foreign key in Server or Single-User Mode; in Local Mode
 * there is exactly one author and no directory to name.
 */
export const CLIENT_ACTOR_PLACEHOLDER = 'current-user'

/**
 * What an update mutation may change, one type per row.
 *
 * Each is `Partial<Pick<Entity, …>>` over the *domain* shape, so a caller
 * hands over booleans and objects and the mutation renders the columns
 * (`rowFrom`). Two things follow, and both are the point of naming them:
 * a field that is not the user's to set — an actor column, a foreign key
 * another action owns — cannot be named at all, and a view can no longer
 * decide how a value is spelled on the wire.
 */

/** The trip fields FR-2.7's editor may change. Status and the series have
 * their own actions, and the rest of the row is not the user's to set. */
export type TripEdit = Partial<
  Pick<Trip, 'name' | 'year' | 'start_date' | 'end_date' | 'attributes'>
>

/** M11's container sheet. The pairing has its own two actions, which write
 * both sides — `paired_container_id` is here for them, not for the sheet. */
export type ContainerEdit = Partial<
  Pick<Container, 'name' | 'carrier_traveler_id' | 'max_weight_grams' | 'paired_container_id'>
>

/** FR-13.1's series. `owner_id` is stamped server-side and never edited. */
export type SeriesEdit = Partial<Pick<TripSeries, 'name' | 'default_attributes'>>

/** FR-13.2's destination profile carries one editable field. */
export type DestinationProfileEdit = Partial<Pick<DestinationProfile, 'notes'>>

/** FR-13.3's checklist entry. */
export type ChecklistItemEdit = Partial<Pick<DestinationChecklistItem, 'label' | 'mode'>>

/** M10's item editor, plus FR-24.3's marker — which `deleteMasterItem` and
 * `restoreMasterItem` write, and no screen sets by hand. `image_hash` is not
 * here: the bytes travel their own endpoints (ADR-002) and the hash with them. */
export type MasterItemEdit = Partial<
  Pick<
    MasterItem,
    | 'name'
    | 'weight_grams'
    | 'value_cents'
    | 'icon'
    | 'default_assignee_id'
    | 'retired_at'
    | 'merged_into_id'
  >
>

/** M8's Vorlage header, plus FR-24.3's marker on the same terms. */
export type TemplateEdit = Partial<Pick<Template, 'name' | 'icon' | 'kind' | 'retired_at'>>

/** M8's position sheet. `template_id` and `item_id` are what the row *is*;
 * moving a position means deleting it and adding another. */
export type TemplateItemEdit = Partial<
  Pick<
    TemplateItem,
    'quantity' | 'assignment' | 'dedup' | 'conditions' | 'default_mode' | 'late_packer'
  >
>

/** The FR-27.4 refresh's propagated fields — the only ones a group may
 * overwrite on a trip row it generated. Everything the user decided on the
 * trip (state, counts, container, assignment) is deliberately absent. */
export type GeneratedTripItemEdit = Partial<
  Pick<
    TripItem,
    'name' | 'quantity' | 'mode' | 'late_packer' | 'weight_grams' | 'value_cents' | 'category_name'
  >
>

/** Addendum §3.20's companion link. Both item ids are the edge itself. */
/**
 * FR-7.14: what a new task may be filed under as it is written — its one tag
 * and its due day. Both optional: absent means the task has none.
 */
export interface TaskFiling {
  taskTagId?: string | null
  dueDate?: string | null
}

export type ItemDependencyEdit = Partial<Pick<ItemDependency, 'mode' | 'quantity'>>

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

export function createMutations(hlc: HLCGenerator, nowIso: NowIso = defaultNowIso) {
  function make(
    op: MutationOp,
    table: string,
    id: string,
    fields?: Record<string, unknown>,
  ): Mutation {
    return {
      mutation_id: newId(),
      op,
      table,
      id,
      fields,
      hlc: hlc.next(),
    }
  }

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
   * the bag (variant P1, owner 2026-09-20), so the row reads as packed.
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

  function addTraveler(
    tripId: string,
    name: string,
    linkedUserId: string | null = null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.travelers, id, {
      trip_id: tripId,
      name,
      linked_user_id: linkedUserId,
    })
    return { mutation, id }
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

  // --- Preparation todo mutations (FR-7.3) ---
  //
  // See CLIENT_ACTOR_PLACEHOLDER for what callers pass as the author.

  /**
   * addTodo creates an open task: on a row (FR-7.3) when `tripItemId` names
   * one, on the trip itself (FR-7.4) when it is null.
   */
  function addTodo(
    tripId: string,
    tripItemId: string | null,
    authorId: string,
    body: string,
    phase: TaskPhase,
    filed: TaskFiling = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.comments, id, {
      trip_id: tripId,
      trip_item_id: tripItemId,
      author_id: authorId,
      body,
      is_task: 1,
      task_state: 'open',
      // FR-7.7: every task is written with a phase — the composer it was
      // typed into knows which, and a task that arrived without one would
      // have to be guessed at by every reader instead of once, here.
      phase,
      // FR-7.7: the moment it was written, named by the client for the same
      // reason `packed_at` is (FR-25.17) — and for one more: the column's
      // DEFAULT is the database's, and **Local Mode has no database server**,
      // so a task written offline would carry no creation time at all and its
      // line would say nothing. A clock is not an identity claim; the author
      // beside it stays the server's (invariant 3).
      created_at: nowIso(),
      // FR-7.14: filed as it is typed — M25's composer names a tag and a day
      // beside the words, and one insert carries them rather than an insert
      // and two updates that a reader could see half-applied. Only what was
      // named: a task without them is written as it always was.
      ...(filed.taskTagId ? { task_tag_id: filed.taskTagId } : {}),
      ...(filed.dueDate ? { due_date: filed.dueDate } : {}),
    })
    return { mutation, id }
  }

  /**
   * FR-7.7: ticking a task off writes the moment of the tap beside the state,
   * the way `packItem` writes `packed_at` — a task is ticked off away from a
   * network and the push can land days later. The *who* is the server's
   * (invariant 3), which is why nothing here names one: in Local Mode there
   * is nobody to name, and the line then says when without saying who (G-8).
   */
  function resolveTodo(todoId: string): Mutation {
    return make('upsert', TABLE.comments, todoId, {
      task_state: 'resolved',
      resolved_at: nowIso(),
    })
  }

  /** Unticking clears the record with the state it described. */
  function reopenTodo(todoId: string): Mutation {
    return make('upsert', TABLE.comments, todoId, {
      task_state: 'open',
      resolved_at: null,
    })
  }

  /**
   * FR-7.7: the crossing — the salve that was not fetched before departure is
   * now a task for the trip itself. One field, because that is the only thing
   * that changes about it: it is the same task, still open, still whosever it
   * was, and it keeps the day it was written.
   */
  function setTaskPhase(todoId: string, phase: TaskPhase | null): Mutation {
    return make('upsert', TABLE.comments, todoId, { phase })
  }

  function deleteTodo(todoId: string): Mutation {
    return make('delete', TABLE.comments, todoId)
  }

  /**
   * setTodoAssignee hands a task to somebody, or back to everybody (FR-7.5)
   * — `setPacker`'s counterpart, and like it the client's to choose; the
   * server turns it into the FR-6.2 delegation notification. Since FR-7.7 it
   * reaches both kinds of task: a preparation can be somebody's job too.
   */
  function setTodoAssignee(todoId: string, userId: string | null): Mutation {
    return make('upsert', TABLE.comments, todoId, { assignee_user_id: userId })
  }

  // --- Container mutations (FR-10.1) ---

  function addContainer(
    tripId: string,
    name: string,
    opts: { carrierTravelerId?: string | null; maxWeightGrams?: number | null } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.containers, id, {
      trip_id: tripId,
      name,
      carrier_traveler_id: opts.carrierTravelerId ?? null,
      max_weight_grams: opts.maxWeightGrams ?? null,
      paired_container_id: null,
    })
    return { mutation, id }
  }

  function updateContainer(containerId: string, fields: ContainerEdit): Mutation {
    return make('upsert', TABLE.containers, containerId, rowFrom(fields))
  }

  function deleteContainer(containerId: string): Mutation {
    return make('delete', TABLE.containers, containerId)
  }

  // --- Comment mutations (FR-7.1/7.2) ---

  /**
   * addComment creates a plain comment; tripItemId null anchors it to the
   * trip. FR-7.13: a trip note may open a thread with a `title`, or answer
   * one by naming its first note as `parentId` — never both, since a reply
   * carries no title (the server drops it). `created_at` is the device's,
   * because a thread is ordered by it and Local Mode has no server to
   * default it.
   */
  function addComment(
    tripId: string,
    tripItemId: string | null,
    authorId: string,
    body: string,
    thread: { title?: string | null; parentId?: string | null } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.comments, id, {
      trip_id: tripId,
      trip_item_id: tripItemId,
      author_id: authorId,
      body,
      is_task: 0,
      created_at: nowIso(),
      ...(thread.parentId ? { parent_id: thread.parentId } : {}),
      ...(!thread.parentId && thread.title ? { title: thread.title } : {}),
    })
    return { mutation, id }
  }

  /**
   * FR-7.13: an entry's words changed by its author — the body, and on a
   * first note the title (`undefined` leaves it alone; `null` takes it off).
   * `edited_at` is the device's clock, named like `resolved_at`, because an
   * edit happens offline too.
   */
  function editNote(noteId: string, body: string, title?: string | null): Mutation {
    return make('upsert', TABLE.comments, noteId, {
      body,
      ...(title !== undefined ? { title } : {}),
      edited_at: nowIso(),
    })
  }

  /** flagCommentAsTask promotes a comment into an open ticket (FR-7.2). */
  /**
   * FR-7.2: a comment becomes an open task. `phase` is written only when the
   * caller names one — FR-7.12's *during*, once *before* is closed; without
   * it the task reads as *before*, as every task without a phase does.
   */
  function flagCommentAsTask(commentId: string, phase?: TaskPhase): Mutation {
    const fields = { is_task: 1, task_state: 'open' }
    return make('upsert', TABLE.comments, commentId, phase ? { ...fields, phase } : fields)
  }

  function deleteComment(commentId: string): Mutation {
    return make('delete', TABLE.comments, commentId)
  }

  // --- Trip note tick mutations (FR-7.9) ---

  /**
   * Tick a note for the first time — a fresh row, one per (note, person),
   * so two people ticking the same note offline both keep their own tick
   * (ADR-073, the same reason FR-24.2's `assignTag` is an insert). userId is
   * the client placeholder; the server stamps it (invariant 3).
   */
  function tickNote(
    tripId: string,
    commentId: string,
    userId: string,
    seenThrough: string | null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.noteAcks, id, {
      trip_id: tripId,
      comment_id: commentId,
      user_id: userId,
      acked: 1,
      seen_through: seenThrough,
    })
    return { mutation, id }
  }

  /**
   * Flip an existing tick — the row already names its person, so the field
   * is the whole change, the same shape as `moveTag`. Un-ticking sets
   * `acked` back rather than deleting the row (NFR-4.2a never deletes).
   * FR-7.13: a tick also says how far it reached — the stamp of the
   * thread's newest entry — so a later reply makes the thread new again;
   * an un-tick leaves that mark alone, it no longer counts.
   */
  function setNoteAcked(ackId: string, acked: boolean, seenThrough?: string | null): Mutation {
    return make('upsert', TABLE.noteAcks, ackId, {
      acked: dbBool(acked),
      ...(acked && seenThrough !== undefined ? { seen_through: seenThrough } : {}),
    })
  }

  // --- Trip mutations ---

  function createTrip(
    name: string,
    year: number,
    startDate: string | null,
    endDate: string | null,
    opts: {
      seriesId?: string | null
      attributes?: Record<string, unknown> | null
      /** FR-2.2: a restore gives back the status it saved (ADR-024). */
      status?: TripStatus
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.trips, id, {
      name,
      // FR-2.1b: the year is the required fact; both dates may be absent.
      year,
      start_date: startDate,
      end_date: endDate,
      status: opts.status ?? TRIP_STATUS_PLANNING,
      series_id: opts.seriesId ?? null,
      attributes: jsonColumn(opts.attributes),
    })
    return { mutation, id }
  }

  function updateTripStatus(tripId: string, status: string): Mutation {
    return make('upsert', TABLE.trips, tripId, { status })
  }

  /**
   * FR-5.10: the moment the packing was declared finished, or `null` to
   * reopen it.
   *
   * One field, alone: NFR-4.2a merges it on its own, so a status another
   * device set meanwhile survives the stamp — and the lifecycle is not what
   * this decides. Closing the packing neither starts nor archives the trip.
   */
  function setPackingClosed(tripId: string, at: string | null): Mutation {
    return make('upsert', TABLE.trips, tripId, { packing_closed_at: at })
  }

  /**
   * updateTrip writes the fields an FR-2.7 edit changed and only those: an
   * upsert of the whole row would hand back a value another device changed
   * meanwhile, which the field-level merge (NFR-4.2a) exists to avoid.
   */
  function updateTrip(tripId: string, fields: TripEdit): Mutation {
    return make('upsert', TABLE.trips, tripId, rowFrom(fields, { attributes: jsonColumn }))
  }

  /** renameTraveler changes the name and nothing else — FR-2.7 forbids
   * modelling a rename as a removal plus an addition, which would detach
   * every row pointing at the traveler. */
  function renameTraveler(travelerId: string, name: string): Mutation {
    return make('upsert', TABLE.travelers, travelerId, { name })
  }

  /**
   * linkTraveler records which account a traveler *is* (FR-2.5, ADR-058), or
   * clears that record with `null`. The server refuses a link naming anybody
   * who is not a current member of the same trip (`not_a_trip_member`), which
   * is why M22 offers only members.
   */
  function linkTraveler(travelerId: string, userId: string | null): Mutation {
    return make('upsert', TABLE.travelers, travelerId, { linked_user_id: userId })
  }

  /** removeTraveler tombstones the traveler row. What happens to the rows
   * assigned to them is FR-27.4's rule, applied by the orchestrator. */
  function removeTravelerRow(travelerId: string): Mutation {
    return make('delete', TABLE.travelers, travelerId)
  }

  /** deleteTrip tombstones the trip on the master partition. The server
   * authorizes this for Owner/Admin only (FR-4.5) and cascades every child
   * row, announcing the three that travel this partition; the client mirrors
   * the rest itself (see `tripLifecycle.deleteTrip`). */
  function deleteTrip(tripId: string): Mutation {
    return make('delete', TABLE.trips, tripId)
  }

  // --- Import mutations (FR-16.2, M15) ---

  /** createImportedTrip inserts a historical trip: archived, marked imported. */
  function createImportedTrip(
    name: string,
    year: number,
    // Null when the sheet named only a year — nothing is fabricated (UX-5).
    endDate: string | null,
    seriesId: string | null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.trips, id, {
      name,
      // FR-2.1b: the one required temporal fact. Omitting it made every
      // imported trip a NOT NULL violation the server refuses.
      year,
      start_date: null,
      end_date: endDate,
      status: TRIP_STATUS_ARCHIVED,
      series_id: seriesId,
      imported: 1,
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

  // --- Series & destination mutations (FR-13.1/13.2) ---

  function setTripSeries(tripId: string, seriesId: string | null): Mutation {
    return make('upsert', TABLE.trips, tripId, { series_id: seriesId })
  }

  function createSeries(
    name: string,
    defaultAttributes: Record<string, unknown> | null = null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    // owner_id is stamped server-side on push (FR-13.1 ownership).
    const mutation = make('insert', TABLE.tripSeries, id, {
      owner_id: '',
      name,
      default_attributes: jsonColumn(defaultAttributes),
    })
    return { mutation, id }
  }

  function updateSeries(seriesId: string, fields: SeriesEdit): Mutation {
    return make(
      'upsert',
      TABLE.tripSeries,
      seriesId,
      rowFrom(fields, { default_attributes: jsonColumn }),
    )
  }

  function createDestinationProfile(seriesId: string): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.destinationProfiles, id, {
      series_id: seriesId,
      notes: null,
    })
    return { mutation, id }
  }

  function updateDestinationProfile(profileId: string, fields: DestinationProfileEdit): Mutation {
    return make('upsert', TABLE.destinationProfiles, profileId, rowFrom(fields))
  }

  function addChecklistItem(
    profileId: string,
    label: string,
    mode: ItemMode,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.destinationChecklistItems, id, {
      profile_id: profileId,
      label,
      mode,
    })
    return { mutation, id }
  }

  function updateChecklistItem(itemId: string, fields: ChecklistItemEdit): Mutation {
    return make('upsert', TABLE.destinationChecklistItems, itemId, rowFrom(fields))
  }

  function deleteChecklistItem(itemId: string): Mutation {
    return make('delete', TABLE.destinationChecklistItems, itemId)
  }

  // --- Master data mutations ---

  function createMasterItem(
    name: string,
    opts: {
      weightGrams?: number | null
      valueCents?: number | null
      /** FR-28.1: the optional mark, absent as often as not. */
      icon?: string | null
      /** FR-1.9: the account the item is normally assigned to. */
      defaultAssigneeId?: string | null
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.items, id, {
      name,
      weight_grams: opts.weightGrams ?? null,
      value_cents: opts.valueCents ?? null,
      icon: opts.icon ?? null,
      default_assignee_id: opts.defaultAssigneeId ?? null,
    })
    return { mutation, id }
  }

  function updateMasterItem(itemId: string, fields: MasterItemEdit): Mutation {
    return make('upsert', TABLE.items, itemId, rowFrom(fields))
  }

  function deleteMasterItem(itemId: string): Mutation {
    return make('delete', TABLE.items, itemId)
  }

  // --- Template mutations ---

  function createTemplate(
    name: string,
    ownerId: string,
    kind: TemplateKind = 'template',
    /** FR-28.8: the optional mark, carried in by a portable import. */
    icon: string | null = null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.templates, id, {
      owner_id: ownerId,
      name,
      kind,
      icon,
    })
    return { mutation, id }
  }

  function updateTemplate(templateId: string, fields: TemplateEdit): Mutation {
    return make('upsert', TABLE.templates, templateId, rowFrom(fields))
  }

  function deleteTemplate(templateId: string): Mutation {
    return make('delete', TABLE.templates, templateId)
  }

  function addTemplateItem(
    templateId: string,
    itemId: string,
    opts: {
      quantity?: number
      assignment?: string
      dedup?: string
      defaultMode?: ItemMode
      latePacker?: boolean
      conditions?: Record<string, unknown> | null
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.templateItems, id, {
      template_id: templateId,
      item_id: itemId,
      quantity: opts.quantity ?? 1,
      assignment: opts.assignment ?? 'per_person',
      dedup: opts.dedup ?? 'max',
      default_mode: opts.defaultMode ?? ITEM_MODE_PACK,
      late_packer: dbBool(opts.latePacker),
      conditions: jsonColumn(opts.conditions),
    })
    return { mutation, id }
  }

  function updateTemplateItem(templateItemId: string, fields: TemplateItemEdit): Mutation {
    return make(
      'upsert',
      TABLE.templateItems,
      templateItemId,
      rowFrom(fields, { conditions: jsonColumn, late_packer: dbBool }),
    )
  }

  function deleteTemplateItem(templateItemId: string): Mutation {
    return make('delete', TABLE.templateItems, templateItemId)
  }

  /** addTemplateInclude references a Gruppe from a Ferien-Vorlage (FR-27.1). */
  function addTemplateInclude(
    templateId: string,
    includedTemplateId: string,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.templateIncludes, id, {
      template_id: templateId,
      included_template_id: includedTemplateId,
    })
    return { mutation, id }
  }

  function removeTemplateInclude(includeId: string): Mutation {
    return make('delete', TABLE.templateIncludes, includeId)
  }

  /** addTemplateItemTask attaches one FR-27.7 preparation task to a position. */
  function addTemplateItemTask(
    templateItemId: string,
    task: string,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.templateItemTasks, id, {
      template_item_id: templateItemId,
      task,
    })
    return { mutation, id }
  }

  function deleteTemplateItemTask(taskId: string): Mutation {
    return make('delete', TABLE.templateItemTasks, taskId)
  }

  /** addTemplateTask attaches one FR-7.4 trip task to a template. */
  /**
   * FR-7.4 with FR-7.7's phase: a Vorlage can author a task for the trip
   * itself — „am Bahnhof die Zugverbindung abklären" is not something you do
   * before leaving, and the trip it generates has to start with it in the
   * right place.
   */
  function addTemplateTask(
    templateId: string,
    task: string,
    phase: TaskPhase,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.templateTasks, id, {
      template_id: templateId,
      task,
      phase,
    })
    return { mutation, id }
  }

  /** FR-7.7: the same task, due at the other end of the trip. */
  function setTemplateTaskPhase(taskId: string, phase: TaskPhase): Mutation {
    return make('upsert', TABLE.templateTasks, taskId, { phase })
  }

  function deleteTemplateTask(taskId: string): Mutation {
    return make('delete', TABLE.templateTasks, taskId)
  }

  // --- The planning-trip refresh (FR-27.4) ---

  /**
   * updateGeneratedTripItem writes the fields the FR-27.4 refresh may
   * overwrite. A field map rather than one setter per field: the diff
   * decides which of them moved, and the caller has no business restating
   * that list. `late_packer` is normalised here because the wire carries
   * 0/1 where the domain carries a boolean. FR-27.16 writes `name` through
   * it too — the same inventory-owned field, taken over on request.
   */
  function updateGeneratedTripItem(itemId: string, fields: GeneratedTripItemEdit): Mutation {
    return make('upsert', TABLE.tripItems, itemId, rowFrom(fields, { late_packer: dbBool }))
  }

  /** registerTripSource records that a trip follows this template (FR-27.4/27.10). */
  function registerTripSource(
    tripId: string,
    templateId: string,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.tripTemplateSources, id, {
      trip_id: tripId,
      template_id: templateId,
    })
    return { mutation, id }
  }

  /**
   * writeGeneratedPosition records what generation produced for one position.
   * An upsert with the entry's derived id: the refresh re-states the whole
   * snapshot each time rather than patching fields, because the snapshot is
   * only meaningful as a set — a half-updated one would read as a manual edit.
   */
  function writeGeneratedPosition(entry: GeneratedPosition): Mutation {
    return make('upsert', TABLE.tripGeneratedPositions, entry.id, {
      trip_id: entry.trip_id,
      trip_item_id: entry.trip_item_id,
      source_template_id: entry.source_template_id,
      source_item_id: entry.source_item_id,
      traveler_id: entry.traveler_id,
      name: entry.name,
      quantity: entry.quantity,
      mode: entry.mode,
      late_packer: dbBool(entry.late_packer),
      weight_grams: entry.weight_grams,
      value_cents: entry.value_cents,
      category_name: entry.category_name,
      tasks: JSON.stringify(entry.tasks),
    })
  }

  function deleteGeneratedPosition(entryId: string): Mutation {
    return make('delete', TABLE.tripGeneratedPositions, entryId)
  }

  /**
   * logAppliedChange writes one line of M2's applied-changes log (FR-27.4).
   * created_at is the client's: the refresh runs on the device, and only it
   * knows when the change actually landed on this trip.
   *
   * `createdAt` overrides it for the one caller that is not making history but
   * replaying it — the ADR-015 restore, whose entries happened long before the
   * restore did and must not sort to the top of M2's list as today's news.
   */
  function logAppliedChange(
    change: Omit<AppliedChange, 'id' | 'created_at'>,
    createdAt?: string,
  ): {
    mutation: Mutation
    id: string
  } {
    const id = newId()
    const mutation = make('insert', TABLE.tripAppliedChanges, id, {
      trip_id: change.trip_id,
      source_template_id: change.source_template_id,
      source_template_name: change.source_template_name,
      kind: change.kind,
      item_name: change.item_name,
      detail: change.detail === null ? null : JSON.stringify(change.detail),
      created_at: createdAt ?? nowIso(),
    })
    return { mutation, id }
  }

  // --- Item dependency mutations (Addendum 3.20, master partition) ---

  function addItemDependency(
    itemId: string,
    dependsOnItemId: string,
    opts: { mode?: 'required' | 'suggested'; quantity?: number | null } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.itemDependencies, id, {
      item_id: itemId,
      depends_on_item_id: dependsOnItemId,
      mode: opts.mode ?? 'required',
      quantity: opts.quantity ?? null,
    })
    return { mutation, id }
  }

  function updateItemDependency(dependencyId: string, fields: ItemDependencyEdit): Mutation {
    return make('upsert', TABLE.itemDependencies, dependencyId, rowFrom(fields))
  }

  function deleteItemDependency(dependencyId: string): Mutation {
    return make('delete', TABLE.itemDependencies, dependencyId)
  }

  // --- Trip membership mutations (FR-4.5/4.7, master partition) ---

  function addTripMember(
    tripId: string,
    userId: string,
    role: 'admin' | 'editor' = 'editor',
  ): { mutation: Mutation; id: string } {
    const id = newId()
    // 'owner' is never client-assignable — the server creates the
    // creator's owner row itself (FR-4.5).
    const mutation = make('insert', TABLE.tripMembers, id, {
      trip_id: tripId,
      user_id: userId,
      role,
    })
    return { mutation, id }
  }

  function setTripMemberRole(memberId: string, role: 'admin' | 'editor'): Mutation {
    return make('upsert', TABLE.tripMembers, memberId, { role })
  }

  function removeTripMember(memberId: string): Mutation {
    return make('delete', TABLE.tripMembers, memberId)
  }

  // --- Task tag mutations (FR-7.8) ---

  /**
   * Create a task tag. Its own table, not the inventory's (owner,
   * 2026-09-21): a task is filed by what it is *about*, an item by what it
   * *is*, and the two never share a picker.
   */
  function createTaskTag(
    name: string,
    sortOrder: number = 0,
    icon: string | null = null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const fields = icon ? { name, sort_order: sortOrder, icon } : { name, sort_order: sortOrder }
    return { mutation: make('insert', TABLE.taskTags, id, fields), id }
  }

  /**
   * FR-7.8: the one tag a task carries. `null` takes it off, which is a
   * state and not a gap — the task then reads under the group named after
   * where it came from.
   *
   * One field, because that is the only thing that changes: the task keeps
   * its words, its phase, its assignee and the day it was written.
   */
  function setTaskTag(todoId: string, taskTagId: string | null): Mutation {
    return make('upsert', TABLE.comments, todoId, { task_tag_id: taskTagId })
  }

  /**
   * FR-7.11: the day a task is due, `YYYY-MM-DD`, or `null` for none. One
   * field, like the tag: a date set on one device and a tag on another
   * both stand (NFR-4.2a).
   */
  function setTaskDueDate(todoId: string, dueDate: string | null): Mutation {
    return make('upsert', TABLE.comments, todoId, { due_date: dueDate })
  }

  /**
   * FR-7.14: a task's words, corrected. One field, and no `edited_at`: that
   * stamp is a note's (FR-7.13), where it says the words are no longer the
   * ones its author was first read saying. A task is shared work, not a
   * signed entry, so any member may reword it — the server's author rule
   * reaches notes only.
   */
  function setTaskBody(todoId: string, body: string): Mutation {
    return make('upsert', TABLE.comments, todoId, { body })
  }

  // --- Tag mutations (FR-24.1) ---

  function createTag(
    name: string,
    sortOrder: number = 0,
    icon: string | null = null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    // The mark only when one was chosen (FR-24.13): an insert that spells out
    // `icon: null` says nothing an absent column does not.
    const fields = icon ? { name, sort_order: sortOrder, icon } : { name, sort_order: sortOrder }
    const mutation = make('insert', TABLE.tags, id, fields)
    return { mutation, id }
  }

  /**
   * Assign a tag to an item at `position` — 0 makes it the item's primary
   * tag (FR-24.2). One row per assignment so two people tagging the same
   * item offline both keep their edit (ADR-014).
   */
  function assignTag(
    itemId: string,
    tagId: string,
    position: number,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.itemTags, id, {
      item_id: itemId,
      tag_id: tagId,
      position,
    })
    return { mutation, id }
  }

  function unassignTag(assignmentId: string): Mutation {
    return make('delete', TABLE.itemTags, assignmentId)
  }

  /**
   * Move an existing assignment (FR-24.9) — one write, not a delete and a
   * re-insert. The row carries nothing but the pairing and its order, so
   * rewriting the position is the whole move; tearing it down and building it
   * again would put a tombstone in the feed for a change that never removed
   * anything (ADR-052).
   */
  function moveTag(assignmentId: string, position: number): Mutation {
    return make('upsert', TABLE.itemTags, assignmentId, { position })
  }

  // --- Managing the tags themselves (FR-24.10) ---

  /**
   * Rename a tag. `tags.name` is `UNIQUE`, so whether the name is free is
   * `nameCollision.findNameCollision`'s answer and is asked before this.
   */
  function renameTag(tagId: string, name: string): Mutation {
    return make('upsert', TABLE.tags, tagId, { name })
  }

  /**
   * Set or clear a tag's mark (FR-24.13). The field alone, for
   * {@link renameTag}'s reason — and `null` is written, not omitted, because
   * clearing is a state of its own (FR-28.1).
   */
  function setTagMark(tagId: string, icon: string | null): Mutation {
    return make('upsert', TABLE.tags, tagId, { icon })
  }

  /** Move a tag on the inventory's axis (FR-24.10) — its grouping order. */
  function reorderTag(tagId: string, sortOrder: number): Mutation {
    return make('upsert', TABLE.tags, tagId, { sort_order: sortOrder })
  }

  /**
   * Point an existing assignment at another tag — the write a merge is made
   * of (FR-24.10). One upsert rather than a delete and an insert, for
   * {@link moveTag}'s reason: nothing about the pairing is removed, so a
   * tombstone would describe something that never happened (ADR-052), and a
   * re-insert would lose the position the item was filed at.
   */
  function retagAssignment(assignmentId: string, tagId: string, position: number): Mutation {
    return make('upsert', TABLE.itemTags, assignmentId, { tag_id: tagId, position })
  }

  /**
   * Point an existing assignment at another **item** — FR-24.15's merge, the
   * mirror of {@link retagAssignment}. One upsert for the same reason: the
   * pairing is not removed, it now names a different item, and the row keeps
   * being the row the feed already knows.
   */
  function reassignItemTag(assignmentId: string, itemId: string, position: number): Mutation {
    return make('upsert', TABLE.itemTags, assignmentId, { item_id: itemId, position })
  }

  /**
   * Move one end of a dependency edge onto the survivor of a merge (FR-24.15).
   * Both ends are written, because either or both may be a merged-away row and
   * the plan has already decided what each resolves to.
   */
  function repointItemDependency(
    dependencyId: string,
    itemId: string,
    dependsOnItemId: string,
  ): Mutation {
    return make('upsert', TABLE.itemDependencies, dependencyId, {
      item_id: itemId,
      depends_on_item_id: dependsOnItemId,
    })
  }

  /**
   * Point a Vorlage position at the survivor of a merge (FR-24.15).
   *
   * Deliberately an update and not the delete-and-add M8's editor uses to
   * *move* a position: the row's FR-27.7 preparation tasks hang off its id
   * (`template_item_tasks.template_item_id`, `ON DELETE CASCADE`), so
   * re-creating the position would silently take the user's own words with it.
   */
  function repointTemplateItem(templateItemId: string, itemId: string): Mutation {
    return make('upsert', TABLE.templateItems, templateItemId, { item_id: itemId })
  }

  /** Remove a tag. Only ever called once nothing carries it (ADR-063). */
  function deleteTag(tagId: string): Mutation {
    return make('delete', TABLE.tags, tagId)
  }

  return {
    /**
     * The raw builder, for a feature module's own tables (FR-30.3). A module
     * gets it through `ModuleHost.mutation`, never this factory, which keeps
     * the named packing mutations above out of its reach.
     */
    make,
    updateGeneratedTripItem,
    registerTripSource,
    writeGeneratedPosition,
    deleteGeneratedPosition,
    logAppliedChange,
    // Trip items
    startPackingNow,
    releasePackingNow,
    // The primitive the four pack helpers are built on. Exported because
    // FR-25.2's undo restores an arbitrary count and state, which none of
    // the helpers can express — they each encode one transition.
    packItem,
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
    unbuyItem,
    setItemMode,
    setMembershipFields,
    assignTraveler,
    assignContainer,
    setLatePacker,
    setReviewFlag,
    setPacker,
    addTripItem,
    deleteTripItem,
    restoreTripItem,
    addTraveler,
    addGeneratedTripItem,
    addClonedTripItem,
    addPortableTripItem,
    // Todos
    addTodo,
    resolveTodo,
    setTodoAssignee,
    setTaskPhase,
    setTaskTag,
    setTaskDueDate,
    setTaskBody,
    createTaskTag,
    reopenTodo,
    deleteTodo,
    addComment,
    editNote,
    flagCommentAsTask,
    deleteComment,
    tickNote,
    setNoteAcked,
    addContainer,
    updateContainer,
    deleteContainer,
    // Trips
    createTrip,
    updateTripStatus,
    setPackingClosed,
    updateTrip,
    renameTraveler,
    linkTraveler,
    removeTravelerRow,
    deleteTrip,
    createImportedTrip,
    addImportedTripItem,
    setTripSeries,
    createSeries,
    updateSeries,
    createDestinationProfile,
    updateDestinationProfile,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    // Master items
    createMasterItem,
    updateMasterItem,
    deleteMasterItem,
    // Templates
    createTemplate,
    updateTemplate,
    addTemplateInclude,
    removeTemplateInclude,
    addTemplateItemTask,
    deleteTemplateItemTask,
    addTemplateTask,
    setTemplateTaskPhase,
    deleteTemplateTask,
    deleteTemplate,
    addTemplateItem,
    updateTemplateItem,
    deleteTemplateItem,
    addItemDependency,
    updateItemDependency,
    deleteItemDependency,
    // Trip membership
    addTripMember,
    setTripMemberRole,
    removeTripMember,
    // Categories
    createTag,
    renameTag,
    setTagMark,
    reorderTag,
    retagAssignment,
    reassignItemTag,
    repointItemDependency,
    repointTemplateItem,
    deleteTag,
    assignTag,
    unassignTag,
    moveTag,
  }
}
