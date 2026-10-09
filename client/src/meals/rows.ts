/**
 * The meal plan's rows on the wire (§3.33, ADR-066 amendment 2): how a meal
 * and an ingredient are read from a pulled row and rebuilt for an optimistic
 * one, and what their deletes follow. The store hands these specs to the
 * kernel on its sinks, so no kernel file names the tables' codecs.
 */
import { TABLE } from '@/api/tables'
import { dbBool } from '@/sync/columns'
import { alsoWith, goesWith, MODULE_ROWS, type RowSpecs } from '@/sync/tableRegistry'
import { ITEM_MODE_BUY_LOCAL } from '@/types/domain'
import {
  MEAL_KIND_COOK,
  MEAL_KIND_OUT,
  MEAL_SLOT_DINNER,
  MEAL_SLOTS,
  type Meal,
  type MealIngredient,
} from './types'

function rowToMeal(id: string, row: Record<string, unknown>): Meal {
  const slot = row['slot'] as Meal['slot']
  return {
    id,
    trip_id: row['trip_id'] as string,
    on_date: row['on_date'] as string,
    slot: MEAL_SLOTS.includes(slot) ? slot : MEAL_SLOT_DINNER,
    title: row['title'] as string,
    kind: row['kind'] === MEAL_KIND_OUT ? MEAL_KIND_OUT : MEAL_KIND_COOK,
    at_time: (row['at_time'] as string) ?? null,
    note: (row['note'] as string) ?? null,
    place: (row['place'] as string) ?? null,
    cook_user_id: (row['cook_user_id'] as string) ?? null,
    excursion_id: (row['excursion_id'] as string) ?? null,
    excursion_packed_at: (row['excursion_packed_at'] as string) ?? null,
  }
}

function rowToMealIngredient(id: string, row: Record<string, unknown>): MealIngredient {
  return {
    id,
    trip_id: row['trip_id'] as string,
    meal_id: row['meal_id'] as string,
    name: row['name'] as string,
    amount: (row['amount'] as string) ?? null,
    list: (row['list'] as MealIngredient['list']) ?? ITEM_MODE_BUY_LOCAL,
    position: (row['position'] as number | null | undefined) ?? null,
    bought: Boolean(row['bought']),
    bought_at: (row['bought_at'] as string) ?? null,
    bought_by_user_id: (row['bought_by_user_id'] as string) ?? null,
    shopping_position: (row['shopping_position'] as number | null | undefined) ?? null,
    fresh: row['fresh'] === null || row['fresh'] === undefined ? null : Boolean(row['fresh']),
  }
}

/** FR-33.1: a meal of the meal plan. */
export function mealRow(meal: Meal): Record<string, unknown> {
  return {
    trip_id: meal.trip_id,
    on_date: meal.on_date,
    slot: meal.slot,
    title: meal.title,
    kind: meal.kind,
    at_time: meal.at_time,
    note: meal.note,
    place: meal.place,
    cook_user_id: meal.cook_user_id,
    excursion_id: meal.excursion_id,
    excursion_packed_at: meal.excursion_packed_at,
  }
}

/** FR-33.2: an ingredient of a meal. */
export function mealIngredientRow(ingredient: MealIngredient): Record<string, unknown> {
  return {
    trip_id: ingredient.trip_id,
    meal_id: ingredient.meal_id,
    name: ingredient.name,
    amount: ingredient.amount,
    list: ingredient.list,
    position: ingredient.position,
    bought: dbBool(ingredient.bought),
    bought_at: ingredient.bought_at,
    bought_by_user_id: ingredient.bought_by_user_id,
    shopping_position: ingredient.shopping_position,
    fresh: ingredient.fresh === null ? null : dbBool(ingredient.fresh),
  }
}

/** The module's tables, specified — the sinks of `store.ts` carry them. */
export const MEAL_ROWS = {
  [TABLE.meals]: { ...MODULE_ROWS, parse: rowToMeal, encode: mealRow },
  [TABLE.mealIngredients]: {
    ...MODULE_ROWS,
    parse: rowToMealIngredient,
    encode: mealIngredientRow,
    cascadeParents: alsoWith(goesWith('meal_id', TABLE.meals)),
  },
} satisfies RowSpecs
