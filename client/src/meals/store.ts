/**
 * The meal plan's rows (§3.33): a trip's meals and their ingredients, held
 * apart from the packing rows and the planner's. The orchestrator reaches them
 * only as the `FeatureStore` below, handed in by the composition root
 * (FR-33.10, ADR-066's arrangement).
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { PullChange } from '@/api/types'
import { bucketedRows, bucketSink } from '@/sync/bucketedRows'
import type { FeatureStore } from '@/sync/featureModule'
import { applyChangesToSinks, specifiedSinks, type RowSinks } from '@/sync/sinks'
import { MEAL_ROWS } from './rows'
import type { Meal, MealIngredient } from './types'
import { TABLE } from '@/api/tables'

export const useMealStore = defineStore('meals', () => {
  // Bucketed by trip like the packing rows: a screen reads one trip's plan.
  const meals = bucketedRows(ref(new Map<string, Meal[]>()), (r) => r.trip_id)
  const ingredients = bucketedRows(ref(new Map<string, MealIngredient[]>()), (r) => r.trip_id)

  function getMeals(tripId: string): Meal[] {
    return meals.get(tripId)
  }

  /** Every meal on the device — where earlier dishes come from (FR-33.4). */
  function allMeals(): Meal[] {
    return meals.all()
  }

  function getMeal(id: string): Meal | undefined {
    return meals.find(id)
  }

  function getIngredients(tripId: string): MealIngredient[] {
    return ingredients.get(tripId)
  }

  /** Every ingredient on the device. */
  function allIngredients(): MealIngredient[] {
    return ingredients.all()
  }

  function ingredientsOf(mealId: string): MealIngredient[] {
    return ingredients.all().filter((ingredient) => ingredient.meal_id === mealId)
  }

  /** The sinks, one per table this module holds — the whole of what the kernel reads. */
  const sinks: RowSinks = specifiedSinks(MEAL_ROWS, {
    [TABLE.meals]: bucketSink(meals),
    [TABLE.mealIngredients]: bucketSink(ingredients),
  })

  function applyChanges(changes: PullChange[]): void {
    applyChangesToSinks(sinks, changes)
  }

  return {
    getMeals,
    allMeals,
    getMeal,
    getIngredients,
    allIngredients,
    ingredientsOf,
    sinks,
    applyChanges,
  }
})

/** This module's store as the orchestrator reads and writes it (FR-33.10). */
export function mealFeatureStore(
  mealStore: ReturnType<typeof useMealStore> = useMealStore(),
): FeatureStore {
  return { sinks: mealStore.sinks }
}
