/**
 * Excursions, their travelers and their lists (FR-31, ADR-077). Spread into `createMutations`
 * (`../mutations.ts`).
 */

import { TABLE } from '@/types/tables'
import { stateFor } from '@/domain/packState'
import { clampQuantity } from '@/domain/quantityChoices'
import { dbBool } from '@/sync/columns'
import { newId } from '@/lib/ids'
import type { Mutation } from '@/api/types'
import { type Excursion, type ExcursionItem, STATE_SKIPPED } from '@/types/domain'
import type { MutationContext } from './context'

export function createExcursionsMutations({ make }: MutationContext) {
  // --- Excursion mutations (FR-31, ADR-077) ---

  /** FR-31.1: a new excursion. Dates are optional calendar days, ordered by the caller. */
  function createExcursion(
    tripId: string,
    fields: {
      name: string
      startsOn: string | null
      endsOn: string | null
      sourceTemplateId: string | null
    },
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.excursions, id, {
      trip_id: tripId,
      name: fields.name,
      starts_on: fields.startsOn,
      ends_on: fields.endsOn,
      source_template_id: fields.sourceTemplateId,
    })
    return { mutation, id }
  }

  /** FR-31.1: rename or re-date an excursion — only the fields named are written. */
  function updateExcursion(
    excursionId: string,
    fields: Partial<Pick<Excursion, 'name' | 'starts_on' | 'ends_on'>>,
  ): Mutation {
    return make('upsert', TABLE.excursions, excursionId, { ...fields })
  }

  function deleteExcursion(excursionId: string): Mutation {
    return make('delete', TABLE.excursions, excursionId)
  }

  /**
   * FR-31.3: somebody goes. A row of its own per person, so two devices
   * adding different people both win (ADR-073's reason for note_acks).
   */
  function addExcursionTraveler(
    tripId: string,
    excursionId: string,
    travelerId: string,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.excursionTravelers, id, {
      trip_id: tripId,
      excursion_id: excursionId,
      traveler_id: travelerId,
    })
    return { mutation, id }
  }

  function removeExcursionTraveler(rowId: string): Mutation {
    return make('delete', TABLE.excursionTravelers, rowId)
  }

  /** FR-31.4: one line of an excursion's list, open, with its link settled by the caller. */
  function addExcursionItem(
    tripId: string,
    excursionId: string,
    line: Pick<
      ExcursionItem,
      | 'trip_item_id'
      | 'source_item_id'
      | 'name'
      | 'category_name'
      | 'assigned_traveler_id'
      | 'quantity'
      | 'mode'
      | 'not_in_luggage'
      | 'for_all_participants'
    >,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const quantity = clampQuantity(line.quantity)
    const mutation = make('insert', TABLE.excursionItems, id, {
      trip_id: tripId,
      excursion_id: excursionId,
      trip_item_id: line.trip_item_id,
      source_item_id: line.source_item_id,
      name: line.name,
      category_name: line.category_name,
      assigned_traveler_id: line.assigned_traveler_id,
      quantity,
      packed_count: 0,
      state: stateFor(0, quantity),
      mode: line.mode,
      bought_at: null,
      not_in_luggage: dbBool(line.not_in_luggage),
      for_all_participants: dbBool(line.for_all_participants),
    })
    return { mutation, id }
  }

  /**
   * FR-31.6: how many of a line are in the rucksack. The count, the amount
   * and the state together, as `setQuantity` writes them for a trip row: the
   * schema's `packed_count <= quantity` refuses a count past the amount.
   */
  function setExcursionItemCount(itemId: string, packedCount: number, quantity: number): Mutation {
    const wanted = clampQuantity(quantity)
    const packed = Math.min(Math.max(packedCount, 0), wanted)
    return make('upsert', TABLE.excursionItems, itemId, {
      quantity: wanted,
      packed_count: packed,
      state: stateFor(packed, wanted),
    })
  }

  /** FR-31.6: decided against, the way FR-5.5 skips a trip row — an amount of zero. */
  function skipExcursionItem(itemId: string): Mutation {
    return make('upsert', TABLE.excursionItems, itemId, {
      quantity: 0,
      packed_count: 0,
      state: STATE_SKIPPED,
    })
  }

  /**
   * FR-31.4/31.7/31.8: the line's own facts that are not its tick — where it
   * comes from, how it is procured, when it was bought.
   */
  function updateExcursionItem(
    itemId: string,
    fields: Partial<
      Pick<
        ExcursionItem,
        'trip_item_id' | 'source_item_id' | 'mode' | 'bought_at' | 'name' | 'shopping_position'
      >
    > & {
      not_in_luggage?: boolean
      for_all_participants?: boolean
    },
  ): Mutation {
    const { not_in_luggage, for_all_participants, ...rest } = fields
    return make('upsert', TABLE.excursionItems, itemId, {
      ...rest,
      ...(not_in_luggage === undefined ? {} : { not_in_luggage: dbBool(not_in_luggage) }),
      ...(for_all_participants === undefined
        ? {}
        : { for_all_participants: dbBool(for_all_participants) }),
    })
  }

  function deleteExcursionItem(itemId: string): Mutation {
    return make('delete', TABLE.excursionItems, itemId)
  }

  /** Puts a removed line back under its own id, tick and all — an undo's other half. */
  function restoreExcursionItem(line: ExcursionItem): Mutation {
    return make('insert', TABLE.excursionItems, line.id, {
      trip_id: line.trip_id,
      excursion_id: line.excursion_id,
      trip_item_id: line.trip_item_id,
      source_item_id: line.source_item_id,
      name: line.name,
      category_name: line.category_name,
      assigned_traveler_id: line.assigned_traveler_id,
      quantity: line.quantity,
      packed_count: line.packed_count,
      state: line.state,
      mode: line.mode,
      bought_at: line.bought_at,
      not_in_luggage: dbBool(line.not_in_luggage),
      for_all_participants: dbBool(line.for_all_participants),
    })
  }

  return {
    createExcursion,
    updateExcursion,
    deleteExcursion,
    addExcursionTraveler,
    removeExcursionTraveler,
    addExcursionItem,
    setExcursionItemCount,
    skipExcursionItem,
    updateExcursionItem,
    deleteExcursionItem,
    restoreExcursionItem,
  }
}
