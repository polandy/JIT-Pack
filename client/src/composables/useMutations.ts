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
    return make('upsert', 'trip_items', itemId, { packed_count: packedCount, state })
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
      mode: 'pack',
      flag_missing: opts.flagMissing ? 1 : 0,
    })
    return { mutation, id }
  }

  function deleteTripItem(itemId: string): Mutation {
    return make('delete', 'trip_items', itemId)
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

  // --- Trip mutations ---

  function createTrip(
    name: string,
    startDate: string,
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
    // Todos
    addTodo,
    resolveTodo,
    reopenTodo,
    deleteTodo,
    // Trips
    createTrip,
    updateTripStatus,
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
