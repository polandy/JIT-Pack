/**
 * Mutation factory — creates properly shaped Mutation objects for common
 * packing-list actions. Every mutation gets a unique ID and the current HLC.
 *
 * All writes go through these helpers → SyncOutbox → server (P-2, G-5).
 */

import type { Mutation, MutationOp } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'
import type { ItemMode } from '@/types/domain'

export function useMutations(hlc: HLCGenerator) {
  function make(
    op: MutationOp,
    table: string,
    id: string,
    fields?: Record<string, unknown>,
  ): Mutation {
    return {
      mutation_id: crypto.randomUUID(),
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
    return make('upsert', 'trip_items', itemId, {
      packed_count: packedCount,
      state,
      packing_now_by: null,
      packing_now_at: null,
    })
  }

  /**
   * startPackingNow claims the item (FR-5.2). The server stamps the
   * real locker (FR-4.2); the timestamp feeds the §7 staleness rule.
   */
  function startPackingNow(itemId: string): Mutation {
    return make('upsert', 'trip_items', itemId, {
      state: 'packing_now',
      packing_now_by: 'current-user',
      packing_now_at: new Date().toISOString(),
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
    return currentPacked > 0
      ? packItem(itemId, 0, 'open')
      : packItem(itemId, 1, 'packed')
  }

  function skipItem(itemId: string): Mutation {
    return make('upsert', 'trip_items', itemId, {
      quantity: 0,
      packed_count: 0,
      state: 'skipped',
    })
  }

  function unskipItem(itemId: string): Mutation {
    return make('upsert', 'trip_items', itemId, {
      quantity: 1,
      packed_count: 0,
      state: 'open',
    })
  }

  function setItemMode(itemId: string, mode: ItemMode): Mutation {
    return make('upsert', 'trip_items', itemId, { mode })
  }

  function assignTraveler(itemId: string, travelerId: string | null): Mutation {
    return make('upsert', 'trip_items', itemId, { assigned_traveler_id: travelerId })
  }

  function assignContainer(itemId: string, containerId: string | null): Mutation {
    return make('upsert', 'trip_items', itemId, { container_id: containerId })
  }

  function setLatePacker(itemId: string, latePacker: boolean): Mutation {
    return make('upsert', 'trip_items', itemId, { late_packer: latePacker ? 1 : 0 })
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
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'trip_items', id, {
      trip_id: tripId,
      name,
      source_item_id: opts.sourceItemId ?? null,
      weight_grams: opts.weightGrams ?? null,
      value_cents: opts.valueCents ?? null,
      category_name: opts.categoryName ?? null,
      quantity: 1,
      packed_count: 0,
      state: 'open',
      mode: opts.mode ?? 'pack',
      flag_missing: opts.flagMissing ? 1 : 0,
    })
    return { mutation, id }
  }

  function deleteTripItem(itemId: string): Mutation {
    return make('delete', 'trip_items', itemId)
  }

  function addTraveler(
    tripId: string,
    name: string,
    profile: 'adult' | 'child',
    linkedUserId: string | null = null,
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'travelers', id, {
      trip_id: tripId,
      name,
      profile,
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
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'trip_items', id, {
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
    const id = crypto.randomUUID()
    const mutation = make('insert', 'trip_items', id, {
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

  // --- Preparation todo mutations (FR-7.3) ---

  function addTodo(
    tripId: string,
    tripItemId: string,
    authorId: string,
    body: string,
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'comments', id, {
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
    return make('upsert', 'comments', todoId, { task_state: 'resolved' })
  }

  function reopenTodo(todoId: string): Mutation {
    return make('upsert', 'comments', todoId, { task_state: 'open' })
  }

  function deleteTodo(todoId: string): Mutation {
    return make('delete', 'comments', todoId)
  }

  /**
   * resetForRepack reopens an item for the return leg (FR-11.1),
   * recording whether it traveled outbound for the M14 review.
   */
  function resetForRepack(itemId: string, wasPacked: boolean): Mutation {
    return make('upsert', 'trip_items', itemId, {
      packed_count: 0,
      state: 'open',
      outbound_packed: wasPacked ? 1 : 0,
      packing_now_by: null,
      packing_now_at: null,
    })
  }

  // --- Container mutations (FR-10.1) ---

  function addContainer(
    tripId: string,
    name: string,
    opts: { carrierTravelerId?: string | null; maxWeightGrams?: number | null } = {},
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'containers', id, {
      trip_id: tripId,
      name,
      carrier_traveler_id: opts.carrierTravelerId ?? null,
      max_weight_grams: opts.maxWeightGrams ?? null,
      paired_container_id: null,
    })
    return { mutation, id }
  }

  function updateContainer(containerId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', 'containers', containerId, fields)
  }

  function deleteContainer(containerId: string): Mutation {
    return make('delete', 'containers', containerId)
  }

  // --- Comment mutations (FR-7.1/7.2) ---

  /** addComment creates a plain comment; tripItemId null anchors it to the trip. */
  function addComment(
    tripId: string,
    tripItemId: string | null,
    authorId: string,
    body: string,
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'comments', id, {
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
    return make('upsert', 'comments', commentId, { is_task: 1, task_state: 'open' })
  }

  function deleteComment(commentId: string): Mutation {
    return make('delete', 'comments', commentId)
  }

  // --- Trip mutations ---

  function createTrip(
    name: string,
    startDate: string | null,
    endDate: string,
    opts: { seriesId?: string | null; attributes?: Record<string, unknown> | null } = {},
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'trips', id, {
      name,
      start_date: startDate,
      end_date: endDate,
      status: 'planning',
      series_id: opts.seriesId ?? null,
      attributes: opts.attributes ? JSON.stringify(opts.attributes) : null,
    })
    return { mutation, id }
  }

  function updateTripStatus(tripId: string, status: string): Mutation {
    return make('upsert', 'trips', tripId, { status })
  }

  // --- Import mutations (FR-16.2, M15) ---

  /** createImportedTrip inserts a historical trip: archived, marked imported. */
  function createImportedTrip(
    name: string,
    endDate: string,
    seriesId: string | null,
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'trips', id, {
      name,
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
    const id = crypto.randomUUID()
    const mutation = make('insert', 'trip_items', id, {
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
    return make('upsert', 'trips', tripId, { series_id: seriesId })
  }

  function createSeries(
    name: string,
    defaultAttributes: Record<string, unknown> | null = null,
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    // owner_id is stamped server-side on push (FR-13.1 ownership).
    const mutation = make('insert', 'trip_series', id, {
      owner_id: '',
      name,
      default_attributes: defaultAttributes ? JSON.stringify(defaultAttributes) : null,
    })
    return { mutation, id }
  }

  function updateSeries(seriesId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', 'trip_series', seriesId, fields)
  }

  function createDestinationProfile(seriesId: string): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'destination_profiles', id, {
      series_id: seriesId,
      notes: null,
    })
    return { mutation, id }
  }

  function updateDestinationProfile(profileId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', 'destination_profiles', profileId, fields)
  }

  function addChecklistItem(
    profileId: string,
    label: string,
    mode: ItemMode,
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'destination_checklist_items', id, {
      profile_id: profileId,
      label,
      mode,
    })
    return { mutation, id }
  }

  function updateChecklistItem(itemId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', 'destination_checklist_items', itemId, fields)
  }

  function deleteChecklistItem(itemId: string): Mutation {
    return make('delete', 'destination_checklist_items', itemId)
  }

  // --- Master data mutations ---

  function createMasterItem(
    name: string,
    opts: {
      categoryId?: string | null
      weightGrams?: number | null
      valueCents?: number | null
      unit?: string
      isConsumable?: boolean
      perDayRate?: number | null
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'items', id, {
      name,
      category_id: opts.categoryId ?? null,
      weight_grams: opts.weightGrams ?? null,
      value_cents: opts.valueCents ?? null,
      unit: opts.unit ?? 'pieces',
      is_consumable: opts.isConsumable ? 1 : 0,
      per_day_rate: opts.perDayRate ?? null,
    })
    return { mutation, id }
  }

  function updateMasterItem(
    itemId: string,
    fields: Record<string, unknown>,
  ): Mutation {
    return make('upsert', 'items', itemId, fields)
  }

  function deleteMasterItem(itemId: string): Mutation {
    return make('delete', 'items', itemId)
  }

  // --- Template mutations ---

  function createTemplate(
    name: string,
    ownerId: string,
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'templates', id, {
      owner_id: ownerId,
      name,
      is_published: 0,
    })
    return { mutation, id }
  }

  function updateTemplate(templateId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', 'templates', templateId, fields)
  }

  function deleteTemplate(templateId: string): Mutation {
    return make('delete', 'templates', templateId)
  }

  function addTemplateItem(
    templateId: string,
    itemId: string,
    opts: {
      quantityFormula?: string
      assignment?: string
      dedup?: string
      defaultMode?: string
      latePacker?: boolean
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'template_items', id, {
      template_id: templateId,
      item_id: itemId,
      quantity_formula: opts.quantityFormula ?? '1',
      assignment: opts.assignment ?? 'per_person',
      dedup: opts.dedup ?? 'max',
      default_mode: opts.defaultMode ?? 'pack',
      late_packer: opts.latePacker ? 1 : 0,
    })
    return { mutation, id }
  }

  function updateTemplateItem(templateItemId: string, fields: Record<string, unknown>): Mutation {
    return make('upsert', 'template_items', templateItemId, fields)
  }

  function deleteTemplateItem(templateItemId: string): Mutation {
    return make('delete', 'template_items', templateItemId)
  }

  // --- Category mutations ---

  function createCategory(name: string, sortOrder: number = 0): { mutation: Mutation; id: string } {
    const id = crypto.randomUUID()
    const mutation = make('insert', 'categories', id, { name, sort_order: sortOrder })
    return { mutation, id }
  }

  return {
    // Trip items
    startPackingNow,
    incrementPacked,
    decrementPacked,
    completePacked,
    zeroPacked,
    togglePacked,
    skipItem,
    unskipItem,
    setItemMode,
    assignTraveler,
    assignContainer,
    setLatePacker,
    addTripItem,
    deleteTripItem,
    addTraveler,
    addGeneratedTripItem,
    addClonedTripItem,
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
    resetForRepack,
    // Trips
    createTrip,
    updateTripStatus,
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
    deleteTemplate,
    addTemplateItem,
    updateTemplateItem,
    deleteTemplateItem,
    // Categories
    createCategory,
  }
}
