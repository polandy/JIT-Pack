/**
 * How the activity log reads the meal plan's rows (FR-32.2) — pure, no I/O,
 * no Vue. A meal reads the way every row does — added, changed, removed — and
 * an ingredient too, except that ticking it is a purchase (FR-33.3), read as
 * the shopping list's own entries are.
 */
import { ACTIVITY_OP } from '@/api/types'
import {
  changedField,
  truthy,
  valueAfter,
  type ActivityReader,
  type ActivityReaders,
} from '@/lib/activityReaders'
import type { MealIngredient } from '@/types/domain'
import { TABLE } from '@/api/tables'

const BOUGHT = 'bought' satisfies keyof MealIngredient

const mealRows: ActivityReader = { area: 'meals' }

const ingredientRows: ActivityReader = {
  area: 'meals',
  classify(entry) {
    if (!changedField(entry, BOUGHT) || entry.op !== ACTIVITY_OP.update) return undefined
    return truthy(valueAfter(entry, BOUGHT)) ? 'bought' : 'unbought'
  },
}

/** The module's readers, by table. */
export const mealActivityReaders: ActivityReaders = {
  [TABLE.meals]: mealRows,
  [TABLE.mealIngredients]: ingredientRows,
}
