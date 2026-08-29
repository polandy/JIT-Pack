/**
 * Mutation factory — creates properly shaped Mutation objects for common
 * packing-list actions. Every mutation gets a unique ID and the current HLC.
 *
 * All writes go through these helpers → SyncOutbox → server (P-2, G-5).
 */

import { TABLE } from '@/types/tables'
import { newId } from '@/lib/ids'
import type { Mutation, MutationOp } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'
import { REVIEW_FLAG_FIELD, TRIP_STATUS_PLANNING } from '@/types/domain'
import type { Trip } from '@/types/domain'
import type {
  AppliedChange,
  GeneratedPosition,
  ItemMode,
  ReviewFlag,
  ShoppingMode,
  TemplateKind,
  TripItem,
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

/** The trip fields FR-2.7's editor may change. Status and the series have
 * their own actions, and the rest of the row is not the user's to set. */
export type TripEdit = Partial<
  Pick<Trip, 'name' | 'year' | 'start_date' | 'end_date' | 'attributes'>
>

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
export type AddedItemDecision = 'packed' | 'skipped'

export function useMutations(hlc: HLCGenerator) {
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
      packed_at: state === 'packed' ? new Date().toISOString() : null,
    })
  }

  /**
   * startPackingNow claims the item (FR-5.2). The server stamps the
   * real locker (FR-4.2); the timestamp feeds the §7 staleness rule.
   */
  function startPackingNow(itemId: string): Mutation {
    return make('upsert', TABLE.tripItems, itemId, {
      state: 'packing_now',
      packing_now_by: CLIENT_ACTOR_PLACEHOLDER,
      packing_now_at: new Date().toISOString(),
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
      state: packedCount >= quantity ? 'packed' : packedCount > 0 ? 'partial' : 'open',
      packing_now_by: null,
      packing_now_at: null,
    })
  }

  function incrementPacked(itemId: string, currentPacked: number, quantity: number): Mutation {
    const newPacked = Math.min(currentPacked + 1, quantity)
    const state = newPacked >= quantity ? 'packed' : newPacked > 0 ? 'partial' : 'open'
    return packItem(itemId, newPacked, state)
  }

  function decrementPacked(itemId: string, currentPacked: number): Mutation {
    const newPacked = Math.max(currentPacked - 1, 0)
    const state = newPacked > 0 ? 'partial' : 'open'
    return packItem(itemId, newPacked, state)
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

  function skipItem(itemId: string): Mutation {
    return make('upsert', TABLE.tripItems, itemId, {
      quantity: 0,
      packed_count: 0,
      state: 'skipped',
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
    if (from === 'buy_local') {
      // Bought at the destination: that is its packed state, and the mode
      // stays what it was — the row never leaves its own list.
      const packed = packItem(itemId, quantity, 'packed')
      return { ...packed, fields: { bought_from: from, ...packed.fields } }
    }
    return make('upsert', TABLE.tripItems, itemId, { bought_from: from, mode: 'pack' })
  }

  /**
   * unbuyItem is FR-25.11j's undo: the row goes back on the list it was
   * bought from, and the record that sent it there is cleared with it.
   */
  function unbuyItem(itemId: string, from: ShoppingMode): Mutation {
    if (from === 'buy_local') {
      const unpacked = packItem(itemId, 0, 'open')
      return { ...unpacked, fields: { bought_from: null, ...unpacked.fields } }
    }
    return make('upsert', TABLE.tripItems, itemId, { bought_from: null, mode: from })
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
    fields: Partial<Pick<TripItem, 'assigned_traveler_id' | 'quantity' | 'packed_count'>>,
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
    return make('upsert', TABLE.tripItems, itemId, { late_packer: latePacker ? 1 : 0 })
  }

  /**
   * FR-9.1 trip feedback. Setting a flag is *additive* in the merge
   * (internal/sync/merge.go) so a concurrent edit can never lose it;
   * clearing one is an ordinary last-writer-wins field, because a
   * judgement made by mistake has to be revocable.
   */
  function setReviewFlag(itemId: string, flag: ReviewFlag, value: boolean): Mutation {
    return make('upsert', TABLE.tripItems, itemId, { [REVIEW_FLAG_FIELD[flag]]: value ? 1 : 0 })
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
      flagMissing?: boolean
      mode?: ItemMode
      decided?: AddedItemDecision
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const packed = opts.decided === 'packed'
    const skipped = opts.decided === 'skipped'
    const mutation = make('insert', TABLE.tripItems, id, {
      trip_id: tripId,
      name,
      source_item_id: opts.sourceItemId ?? null,
      weight_grams: opts.weightGrams ?? null,
      value_cents: opts.valueCents ?? null,
      category_name: opts.categoryName ?? null,
      quantity: skipped ? 0 : 1,
      packed_count: packed ? 1 : 0,
      state: opts.decided ?? 'open',
      packed_at: packed ? new Date().toISOString() : null,
      mode: opts.mode ?? 'pack',
      flag_missing: opts.flagMissing ? 1 : 0,
    })
    return { mutation, id }
  }

  function deleteTripItem(itemId: string): Mutation {
    return make('delete', TABLE.tripItems, itemId)
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
    item: {
      source_item_id: string | null
      source_template_id: string | null
      name: string
      category_name: string | null
      weight_grams: number | null
      value_cents: number | null
      quantity: number
      mode: ItemMode
      late_packer: boolean
    },
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
      late_packer: item.late_packer ? 1 : 0,
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
      late_packer: item.late_packer ? 1 : 0,
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
      mode: string
      latePacker: boolean
    },
    assignedTravelerId: string | null,
    containerId: string | null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const packed = Math.min(item.packedCount, item.quantity)
    const state =
      item.quantity === 0
        ? 'skipped'
        : packed === 0
          ? 'open'
          : packed >= item.quantity
            ? 'packed'
            : 'partial'
    const mutation = make('insert', TABLE.tripItems, id, {
      trip_id: tripId,
      name: item.name,
      source_item_id: item.sourceItemId,
      category_name: item.categoryName,
      quantity: item.quantity,
      packed_count: packed,
      state,
      mode: item.mode,
      late_packer: item.latePacker ? 1 : 0,
      assigned_traveler_id: assignedTravelerId,
      container_id: containerId,
    })
    return { mutation, id }
  }

  // --- Preparation todo mutations (FR-7.3) ---
  //
  // See CLIENT_ACTOR_PLACEHOLDER for what callers pass as the author.

  function addTodo(
    tripId: string,
    tripItemId: string,
    authorId: string,
    body: string,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.comments, id, {
      trip_id: tripId,
      trip_item_id: tripItemId,
      author_id: authorId,
      body,
      is_task: 1,
      task_state: 'open',
    })
    return { mutation, id }
  }

  function resolveTodo(todoId: string): Mutation {
    return make('upsert', TABLE.comments, todoId, { task_state: 'resolved' })
  }

  function reopenTodo(todoId: string): Mutation {
    return make('upsert', TABLE.comments, todoId, { task_state: 'open' })
  }

  function deleteTodo(todoId: string): Mutation {
    return make('delete', TABLE.comments, todoId)
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

  function updateContainer(containerId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', TABLE.containers, containerId, fields)
  }

  function deleteContainer(containerId: string): Mutation {
    return make('delete', TABLE.containers, containerId)
  }

  // --- Comment mutations (FR-7.1/7.2) ---

  /** addComment creates a plain comment; tripItemId null anchors it to the trip. */
  function addComment(
    tripId: string,
    tripItemId: string | null,
    authorId: string,
    body: string,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.comments, id, {
      trip_id: tripId,
      trip_item_id: tripItemId,
      author_id: authorId,
      body,
      is_task: 0,
    })
    return { mutation, id }
  }

  /** flagCommentAsTask promotes a comment into an open ticket (FR-7.2). */
  function flagCommentAsTask(commentId: string): Mutation {
    return make('upsert', TABLE.comments, commentId, { is_task: 1, task_state: 'open' })
  }

  function deleteComment(commentId: string): Mutation {
    return make('delete', TABLE.comments, commentId)
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
      attributes: opts.attributes ? JSON.stringify(opts.attributes) : null,
    })
    return { mutation, id }
  }

  function updateTripStatus(tripId: string, status: string): Mutation {
    return make('upsert', TABLE.trips, tripId, { status })
  }

  /**
   * updateTrip writes the fields an FR-2.7 edit changed and only those: an
   * upsert of the whole row would hand back a value another device changed
   * meanwhile, which the field-level merge (NFR-4.2a) exists to avoid.
   */
  function updateTrip(tripId: string, fields: TripEdit): Mutation {
    const row: Record<string, unknown> = { ...fields }
    if ('attributes' in fields) {
      row.attributes = fields.attributes ? JSON.stringify(fields.attributes) : null
    }
    return make('upsert', TABLE.trips, tripId, row)
  }

  /** renameTraveler changes the name and nothing else — FR-2.7 forbids
   * modelling a rename as a removal plus an addition, which would detach
   * every row pointing at the traveler. */
  function renameTraveler(travelerId: string, name: string): Mutation {
    return make('upsert', TABLE.travelers, travelerId, { name })
  }

  /** removeTraveler tombstones the traveler row. What happens to the rows
   * assigned to them is FR-27.4's rule, applied by the orchestrator. */
  function removeTravelerRow(travelerId: string): Mutation {
    return make('delete', TABLE.travelers, travelerId)
  }

  /** deleteTrip tombstones the trip on the master partition. The server
   * authorizes this for Owner/Admin only (FR-4.5) and cascades the trip's
   * items, travelers, containers and members. */
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
      status: 'archived',
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
      mode: 'pack',
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
      default_attributes: defaultAttributes ? JSON.stringify(defaultAttributes) : null,
    })
    return { mutation, id }
  }

  function updateSeries(seriesId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', TABLE.tripSeries, seriesId, fields)
  }

  function createDestinationProfile(seriesId: string): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.destinationProfiles, id, {
      series_id: seriesId,
      notes: null,
    })
    return { mutation, id }
  }

  function updateDestinationProfile(profileId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', TABLE.destinationProfiles, profileId, fields)
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

  function updateChecklistItem(itemId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', TABLE.destinationChecklistItems, itemId, fields)
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
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.items, id, {
      name,
      weight_grams: opts.weightGrams ?? null,
      value_cents: opts.valueCents ?? null,
      icon: opts.icon ?? null,
    })
    return { mutation, id }
  }

  function updateMasterItem(itemId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', TABLE.items, itemId, fields)
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

  function updateTemplate(templateId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', TABLE.templates, templateId, fields)
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
      defaultMode?: string
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
      default_mode: opts.defaultMode ?? 'pack',
      late_packer: opts.latePacker ? 1 : 0,
      conditions: opts.conditions ? JSON.stringify(opts.conditions) : null,
    })
    return { mutation, id }
  }

  function updateTemplateItem(templateItemId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', TABLE.templateItems, templateItemId, fields)
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

  // --- The planning-trip refresh (FR-27.4) ---

  /**
   * updateGeneratedTripItem writes the fields the FR-27.4 refresh may
   * overwrite. A field map rather than one setter per field: the diff
   * decides which of them moved, and the caller has no business restating
   * that list. `late_packer` is normalised here because the wire carries
   * 0/1 where the domain carries a boolean.
   */
  function updateGeneratedTripItem(itemId: string, fields: Record<string, unknown>): Mutation {
    const wire = { ...fields }
    if ('late_packer' in wire) wire['late_packer'] = wire['late_packer'] ? 1 : 0
    return make('upsert', TABLE.tripItems, itemId, wire)
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
      late_packer: entry.late_packer ? 1 : 0,
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
      created_at: createdAt ?? new Date().toISOString(),
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

  function updateItemDependency(dependencyId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', TABLE.itemDependencies, dependencyId, fields)
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

  // --- Tag mutations (FR-24.1) ---

  function createTag(name: string, sortOrder: number = 0): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.tags, id, { name, sort_order: sortOrder })
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

  return {
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
    skipItem,
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
    addTraveler,
    addGeneratedTripItem,
    addClonedTripItem,
    addPortableTripItem,
    // Todos
    addTodo,
    resolveTodo,
    reopenTodo,
    deleteTodo,
    addComment,
    flagCommentAsTask,
    deleteComment,
    addContainer,
    updateContainer,
    deleteContainer,
    // Trips
    createTrip,
    updateTripStatus,
    updateTrip,
    renameTraveler,
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
    assignTag,
    unassignTag,
  }
}
