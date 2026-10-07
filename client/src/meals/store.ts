/**
 * The meal plan's rows (§3.33): a trip's meals and their ingredients, held
 * apart from the packing rows and the planner's. The orchestrator reaches them
 * only as the `FeatureStore` below, handed in by the composition root
 * (FR-33.10, ADR-066's arrangement).
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { PullChange } from '@/api/types'
import type { CascadeRow } from '@/sync/cascade'
import type { FeatureStore } from '@/sync/featureModule'
import { encodedRow, TABLE_SPECS, type SyncRow } from '@/sync/tableRegistry'
import type { Meal, MealIngredient } from '@/types/domain'
import { TABLE, type SyncTable } from '@/types/tables'

/** The tables this module holds. */
const MEAL_TABLES: ReadonlySet<string> = new Set<string>([TABLE.meals, TABLE.mealIngredients])

export const useMealStore = defineStore('meals', () => {
  // Flat and keyed by id, like the planner's: a trip's plan is a few dozen rows.
  const meals = ref<Map<string, Meal>>(new Map())
  const ingredients = ref<Map<string, MealIngredient>>(new Map())

  function getMeals(tripId: string): Meal[] {
    return [...meals.value.values()].filter((meal) => meal.trip_id === tripId)
  }

  /** Every meal on the device — where earlier dishes come from (FR-33.4). */
  function allMeals(): Meal[] {
    return [...meals.value.values()]
  }

  function getMeal(id: string): Meal | undefined {
    return meals.value.get(id)
  }

  function getIngredients(tripId: string): MealIngredient[] {
    return [...ingredients.value.values()].filter((ingredient) => ingredient.trip_id === tripId)
  }

  /** Every ingredient on the device. */
  function allIngredients(): MealIngredient[] {
    return [...ingredients.value.values()]
  }

  function ingredientsOf(mealId: string): MealIngredient[] {
    return [...ingredients.value.values()].filter((ingredient) => ingredient.meal_id === mealId)
  }

  /** Where each of the module's tables keeps its rows — what a write reads back. */
  const rowMaps: Record<string, Map<string, unknown>> = {
    [TABLE.meals]: meals.value,
    [TABLE.mealIngredients]: ingredients.value,
  }

  /** One row in its wire shape, or undefined where this store does not hold it. */
  function currentRow(table: string, id: string): SyncRow | undefined {
    const row = rowMaps[table]?.get(id)
    return row === undefined ? undefined : encodedRow(table as SyncTable, row)
  }

  function applyChanges(changes: PullChange[]): void {
    for (const change of changes) {
      switch (change.table) {
        case TABLE.meals:
          apply(meals.value, change, (id, row) => TABLE_SPECS[TABLE.meals].parse(id, row))
          break
        case TABLE.mealIngredients:
          apply(ingredients.value, change, (id, row) =>
            TABLE_SPECS[TABLE.mealIngredients].parse(id, row),
          )
          break
      }
    }
  }

  /** The rows a meal's delete takes with it — its ingredients (FR-33.9). */
  function mealChildRows(mealId: string): CascadeRow[] {
    return ingredientsOf(mealId).map((ingredient) => ({
      table: TABLE.mealIngredients,
      id: ingredient.id,
    }))
  }

  /** Everything a deleted trip takes with it, leaf-first. */
  function tripChildRows(tripId: string): CascadeRow[] {
    return [
      ...getIngredients(tripId).map((ingredient) => ({
        table: TABLE.mealIngredients,
        id: ingredient.id,
      })),
      ...getMeals(tripId).map((meal) => ({ table: TABLE.meals, id: meal.id })),
    ]
  }

  function forgetTrip(tripId: string): void {
    for (const ingredient of getIngredients(tripId)) ingredients.value.delete(ingredient.id)
    for (const meal of getMeals(tripId)) meals.value.delete(meal.id)
  }

  return {
    getMeals,
    allMeals,
    getMeal,
    getIngredients,
    allIngredients,
    ingredientsOf,
    applyChanges,
    currentRow,
    mealChildRows,
    tripChildRows,
    forgetTrip,
  }
})

function apply<T>(
  rows: Map<string, T>,
  change: PullChange,
  parse: (id: string, row: SyncRow) => T,
): void {
  if (change.deleted) rows.delete(change.id)
  else if (change.row) rows.set(change.id, parse(change.id, change.row as SyncRow))
}

/** This module's store as the orchestrator reads and writes it (FR-33.10). */
export function mealFeatureStore(
  mealStore: ReturnType<typeof useMealStore> = useMealStore(),
): FeatureStore {
  return {
    tables: MEAL_TABLES,
    applyChanges: (changes) => mealStore.applyChanges(changes),
    currentRow: (table, id) => mealStore.currentRow(table, id),
    tripChildRows: (tripId) => mealStore.tripChildRows(tripId),
    forgetTrip: (tripId) => mealStore.forgetTrip(tripId),
  }
}
