/**
 * FR-33.15: the words a move's toast adds when a meal's bought fresh
 * ingredients may not last until its new day — shared by the drag on M31 and
 * the sheet's day chips, so both ask the same.
 */
import { t } from '@/i18n'
import { shortWeekday } from '@/lib/taskDueText'
import type { MealIngredient } from '@/types/domain'
import { isFresh } from './domain/ingredients'
import { freshBoughtTooEarly } from './domain/mealPlan'

/** How many ingredients the question names before it counts the rest. */
export const FRESH_NAMED = 2

/**
 * The question for a meal moved from `from` to `day`, or null when nothing
 * fresh is at stake. `ingredients` are the meal's own; `learned` is
 * `learnedFreshness` over every meal on the device.
 */
export function freshNote(
  from: string,
  day: string,
  ingredients: readonly MealIngredient[],
  learned: ReadonlyMap<string, boolean>,
): string | null {
  const stale = freshBoughtTooEarly({ on_date: from }, day, ingredients, (ingredient) =>
    isFresh(ingredient, learned),
  )
  if (stale.length === 0) return null
  const named = stale
    .slice(0, FRESH_NAMED)
    .map((ingredient) => ingredient.name)
    .join(', ')
  const more = stale.length - FRESH_NAMED
  return t('meals.movedFresh', {
    names: more > 0 ? t('meals.movedFreshMore', { names: named, more }) : named,
    day: shortWeekday(day),
    n: stale.length,
  })
}
