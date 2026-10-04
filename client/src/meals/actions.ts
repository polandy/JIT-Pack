/**
 * The meal plan's writes (§3.33) — its own rows only, through the
 * `ModuleHost` the orchestrator hands out: the same outbox, clock and
 * optimistic paint as every other write.
 *
 * A meal is written by its sheet's button, with its ingredients in one go:
 * a new one inserts both, a changed one writes only the fields that changed
 * and only the ingredients that did, so two people editing one meal overwrite
 * nothing of each other's. Ticking an ingredient or packing a picnic is a
 * write of its own, at once (FR-33.3, FR-33.6).
 */
import { newId } from '@/lib/ids'
import { dbBool } from '@/sync/columns'
import { cascadeTombstones } from '@/sync/cascade'
import type { ModuleHost, QueuedModuleMutation } from '@/sync/featureModule'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { TABLE_CODECS } from '@/sync/tableRegistry'
import type { Meal, MealIngredient, MealKind, MealSlot, ShoppingMode } from '@/types/domain'
import { MEAL_KIND_OUT } from '@/types/domain'
import { TABLE } from '@/types/tables'
import { isMealTime } from './domain/mealPlan'
import type { useMealStore } from './store'

/** What the sheet writes of the meal itself. */
export interface MealFields {
  day: string
  slot: MealSlot
  title: string
  kind: MealKind
  /** `HH:MM`, or null for none. */
  time: string | null
  note: string | null
  place: string | null
  cookUserId: string | null
  /** The excursion it is taken on — already judged by `canTakeAlong`; null for none. */
  excursionId: string | null
}

/** One ingredient as the sheet holds it: a saved one by its id, a new one by none. */
export interface DraftIngredient {
  id: string | null
  name: string
  amount: string | null
  list: ShoppingMode
  bought: boolean
}

export function createMealActions(host: ModuleHost, mealStore: ReturnType<typeof useMealStore>) {
  const encodeMeal = (meal: Meal) => TABLE_CODECS[TABLE.meals].encode!(meal)
  const encodeIngredient = (ingredient: MealIngredient) =>
    TABLE_CODECS[TABLE.mealIngredients].encode!(ingredient)

  /**
   * FR-33.1/33.2: writes a meal and its ingredients — a new one when `meal`
   * is null. A blank dish takes the place's name; with neither there is no
   * meal, and null comes back. A meal eaten out keeps no ingredients.
   */
  function saveMeal(
    tripId: string,
    meal: Meal | null,
    fields: MealFields,
    drafts: readonly DraftIngredient[],
  ): string | null {
    const title = titleOf(fields)
    if (title === '') return null
    const own = {
      on_date: fields.day,
      slot: fields.slot,
      title,
      kind: fields.kind,
      at_time: isMealTime(fields.time) ? fields.time : null,
      note: blankToNull(fields.note),
      place: fields.kind === MEAL_KIND_OUT ? blankToNull(fields.place) : null,
      cook_user_id: fields.kind === MEAL_KIND_OUT ? null : fields.cookUserId,
      excursion_id: fields.kind === MEAL_KIND_OUT ? null : fields.excursionId,
    }
    const writes: QueuedModuleMutation[] = []
    let mealId: string
    if (meal === null) {
      mealId = newId()
      const mutation = host.mutation('insert', TABLE.meals, mealId, {
        trip_id: tripId,
        ...own,
        excursion_packed_at: null,
      })
      writes.push({ mutation, optimistic: optimisticInsert(mutation) })
    } else {
      mealId = meal.id
      const patch: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(own)) {
        if (value !== meal[key as keyof Meal]) patch[key] = value
      }
      // FR-33.6: a picnic leaving its excursion leaves its packed state there.
      if ('excursion_id' in patch && meal.excursion_packed_at !== null) {
        patch['excursion_packed_at'] = null
      }
      if (Object.keys(patch).length > 0) {
        const mutation = host.mutation('upsert', TABLE.meals, meal.id, patch)
        writes.push({ mutation, optimistic: optimisticUpdate(mutation, encodeMeal(meal)) })
      }
    }
    const kept = fields.kind === MEAL_KIND_OUT ? [] : drafts
    writes.push(...ingredientWrites(tripId, mealId, kept))
    if (writes.length > 0) host.writeTrip(tripId, ...writes)
    return mealId
  }

  /** The ingredient writes that bring a meal's saved list to the drafts. */
  function ingredientWrites(
    tripId: string,
    mealId: string,
    drafts: readonly DraftIngredient[],
  ): QueuedModuleMutation[] {
    const saved = new Map(mealStore.ingredientsOf(mealId).map((ing) => [ing.id, ing]))
    const writes: QueuedModuleMutation[] = []
    drafts.forEach((draft, position) => {
      const current = draft.id ? saved.get(draft.id) : undefined
      if (!current) {
        const mutation = host.mutation('insert', TABLE.mealIngredients, newId(), {
          trip_id: tripId,
          meal_id: mealId,
          name: draft.name,
          amount: draft.amount,
          list: draft.list,
          position,
          bought: dbBool(draft.bought),
          bought_at: draft.bought ? host.nowIso() : null,
          bought_by_user_id: null,
          shopping_position: null,
        })
        writes.push({ mutation, optimistic: optimisticInsert(mutation) })
        return
      }
      saved.delete(current.id)
      const patch: Record<string, unknown> = {}
      if (draft.name !== current.name) patch['name'] = draft.name
      if (draft.amount !== current.amount) patch['amount'] = draft.amount
      if (draft.list !== current.list) patch['list'] = draft.list
      if (position !== current.position) patch['position'] = position
      if (Object.keys(patch).length === 0) return
      const mutation = host.mutation('upsert', TABLE.mealIngredients, current.id, patch)
      writes.push({ mutation, optimistic: optimisticUpdate(mutation, encodeIngredient(current)) })
    })
    for (const gone of saved.values()) {
      const mutation = host.mutation('delete', TABLE.mealIngredients, gone.id)
      writes.push({ mutation, optimistic: optimisticDelete(mutation) })
    }
    return writes
  }

  /**
   * FR-33.3: the purchase, FR-30.4's record — the tap's time travels with it
   * and the server stamps who; taking it back clears both.
   */
  function setBought(ingredient: MealIngredient, bought: boolean): void {
    const mutation = host.mutation('upsert', TABLE.mealIngredients, ingredient.id, {
      bought: dbBool(bought),
      bought_at: bought ? host.nowIso() : null,
      bought_by_user_id: null,
    })
    host.writeTrip(ingredient.trip_id, {
      mutation,
      optimistic: optimisticUpdate(mutation, encodeIngredient(ingredient)),
    })
  }

  /** FR-30.13: the ingredient's place inside its heading on M6. */
  function placeOnShopping(ingredient: MealIngredient, position: number): void {
    if (position === ingredient.shopping_position) return
    const mutation = host.mutation('upsert', TABLE.mealIngredients, ingredient.id, {
      shopping_position: position,
    })
    host.writeTrip(ingredient.trip_id, {
      mutation,
      optimistic: optimisticUpdate(mutation, encodeIngredient(ingredient)),
    })
  }

  /** FR-33.6: the picnic packed into its excursion's rucksack, or taken out again. */
  function setPacked(meal: Meal, packed: boolean): void {
    const mutation = host.mutation('upsert', TABLE.meals, meal.id, {
      excursion_packed_at: packed ? host.nowIso() : null,
    })
    host.writeTrip(meal.trip_id, {
      mutation,
      optimistic: optimisticUpdate(mutation, encodeMeal(meal)),
    })
  }

  /** FR-33.9: deletes a meal with every ingredient it has, bought or not. */
  function removeMeal(meal: Meal): void {
    const mutation = host.mutation('delete', TABLE.meals, meal.id)
    host.writeTrip(meal.trip_id, {
      mutation,
      optimistic: [
        ...cascadeTombstones(mealStore.mealChildRows(meal.id)),
        optimisticDelete(mutation),
      ],
    })
  }

  return { saveMeal, setBought, placeOnShopping, setPacked, removeMeal }
}

export type MealActions = ReturnType<typeof createMealActions>

/** The dish a meal is called by: its title, else — eaten out — where. */
function titleOf(fields: MealFields): string {
  const title = fields.title.trim()
  if (title !== '' || fields.kind !== MEAL_KIND_OUT) return title
  return (fields.place ?? '').split(',')[0]!.trim()
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
