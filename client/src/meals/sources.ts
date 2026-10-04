/**
 * The meal plan as a source of the other screens' lines (§3.33): its
 * ingredients on the shopping list (FR-33.3), its meals on the day plan
 * (FR-33.5) and a picnic on its excursion's list (FR-33.6). Each through its
 * kernel contract, with the module's writes bound in — a projection read from
 * the rows on every render, never a copy.
 */
import { formatDate, t } from '@/i18n'
import type { DayPlanLine, DayPlanSource } from '@/lib/dayPlanSources'
import { DAY_PLAN_MEAL } from '@/lib/dayPlanSources'
import type { ExcursionExtraSource } from '@/lib/excursionExtraLines'
import type { MealContext } from '@/lib/mealContext'
import type { ShoppingLine, ShoppingSource } from '@/lib/shoppingSources'
import { localDay } from '@/lib/taskDueText'
import { tripSubPath } from '@/router/paths'
import type { Meal, MealIngredient, ShoppingMode } from '@/types/domain'
import { MEAL_KIND_COOK, MEAL_KIND_OUT } from '@/types/domain'
import type { MealActions } from './actions'
import {
  SLOT_PLACE,
  boughtShare,
  ingredientDue,
  ingredientOnOpenList,
  inOrder,
  isMealTime,
} from './domain/mealPlan'
import type { useMealSheet } from './sheet'
import type { useMealStore } from './store'

/** Where the meal plan's heading stands among the sources' — after every excursion's. */
const MEAL_SECTION_RANK = 1

/** What the sources read beside the module's own rows. */
export interface MealSourceDeps {
  store: ReturnType<typeof useMealStore>
  actions: MealActions
  sheet: ReturnType<typeof useMealSheet>
  context: MealContext
  /** Today as the device reckons it (`orchestrator.today()`). */
  today(): string
}

/** „Mo. Abend" — the day and slot a meal is eaten at, short enough for a second line. */
export function mealWhen(meal: Pick<Meal, 'on_date' | 'slot'>): string {
  return t('meals.when', {
    weekday: formatDate(localDay(meal.on_date), { weekday: 'short' }),
    slot: t(`meals.slotShort.${meal.slot}`),
  })
}

/** A meal's second line: eaten out and where, or how much of it is bought (M31, FR-33.5). */
export function mealFacts(meal: Meal, ingredients: readonly MealIngredient[]): string {
  if (meal.kind === MEAL_KIND_OUT) {
    return meal.place ? t('meals.outAt', { place: meal.place }) : t('meals.out')
  }
  const share = boughtShare(ingredients)
  if (share.total === 0) return t('meals.noIngredients')
  if (share.bought === share.total) return t('meals.allBought')
  return t('meals.bought', share)
}

/** FR-33.3: every meal's ingredients as lines of M6, under one heading. */
export function createMealShoppingSource(deps: MealSourceDeps): ShoppingSource {
  function tripStart(tripId: string): string | null {
    return deps.context.trips().find((trip) => trip.id === tripId)?.start_date ?? null
  }

  function lines(tripId: string, list: ShoppingMode, bought: boolean): ShoppingLine[] {
    const meals = new Map(deps.store.getMeals(tripId).map((meal) => [meal.id, meal]))
    const start = tripStart(tripId)
    const today = deps.today()
    return deps.store
      .getIngredients(tripId)
      .filter((ingredient) => ingredient.list === list && ingredient.bought === bought)
      .flatMap((ingredient) => {
        const meal = meals.get(ingredient.meal_id)
        if (!meal || meal.kind !== MEAL_KIND_COOK) return []
        if (!bought && !ingredientOnOpenList(meal, today)) return []
        return [{ meal, ingredient }]
      })
      .sort(
        (a, b) =>
          a.meal.on_date.localeCompare(b.meal.on_date) ||
          SLOT_PLACE[a.meal.slot].localeCompare(SLOT_PLACE[b.meal.slot]) ||
          (a.ingredient.position ?? 0) - (b.ingredient.position ?? 0),
      )
      .map(({ meal, ingredient }) => line(meal, ingredient, start))
  }

  function line(meal: Meal, ingredient: MealIngredient, start: string | null): ShoppingLine {
    const when = t('meals.shoppingDetail', { when: mealWhen(meal), title: meal.title })
    return {
      key: `meal:${ingredient.id}`,
      name: ingredient.name,
      quantity: 1,
      recipients: [],
      section: t('meals.shoppingHeading'),
      sectionRank: MEAL_SECTION_RANK,
      detail: [ingredient.amount, when].filter((part) => !!part).join(' · '),
      dueDate: ingredient.bought ? null : ingredientDue(meal, ingredient, start),
      pressingDays: 0,
      position: ingredient.shopping_position,
      boughtNote: ingredient.bought ? when : undefined,
      boughtAt: ingredient.bought_at,
      boughtBy: ingredient.bought_by_user_id,
      buy: () => deps.actions.setBought(ingredient, true),
      unbuy: () => deps.actions.setBought(ingredient, false),
      place: (position) => deps.actions.placeOnShopping(ingredient, position),
    }
  }

  return {
    open: (tripId, list) => lines(tripId, list, false),
    bought: (tripId, list) => lines(tripId, list, true),
  }
}

/** FR-33.5: every meal as a line of the day plan, opening its sheet over the plan. */
export function createMealDayPlanSource(deps: MealSourceDeps): DayPlanSource {
  return {
    lines(tripId: string): DayPlanLine[] {
      const ingredients = deps.store.getIngredients(tripId)
      return deps.store.getMeals(tripId).map((meal) => {
        const own = ingredients.filter((ingredient) => ingredient.meal_id === meal.id)
        const share = boughtShare(own)
        const cooked = meal.kind === MEAL_KIND_COOK
        return {
          key: `meal:${meal.id}`,
          kind: DAY_PLAN_MEAL,
          title: meal.title,
          from: meal.on_date,
          to: meal.on_date,
          detail: mealFacts(meal, own),
          assignee: cooked ? meal.cook_user_id : null,
          progress: cooked && share.total > 0 ? share.bought / share.total : null,
          done: null,
          path: tripSubPath(tripId, 'meals'),
          open: () => deps.sheet.openMeal(tripId, meal.id),
          time: isMealTime(meal.at_time) ? meal.at_time : null,
          placeAt: SLOT_PLACE[meal.slot],
          timeWord: t(`meals.slotWord.${meal.slot}`),
          label: t(`meals.slot.${meal.slot}`),
        }
      })
    },
  }
}

/** FR-33.6: a picnic taken on an excursion, as one line of its list. */
export function createMealExcursionSource(deps: MealSourceDeps): ExcursionExtraSource {
  return {
    lines(tripId, excursionId) {
      return deps.store
        .getMeals(tripId)
        .filter((meal) => meal.excursion_id === excursionId && meal.kind === MEAL_KIND_COOK)
        .sort(
          (a, b) =>
            a.on_date.localeCompare(b.on_date) ||
            SLOT_PLACE[a.slot].localeCompare(SLOT_PLACE[b.slot]),
        )
        .map((meal) => ({
          key: `meal:${meal.id}`,
          group: t('meals.excursionGroup'),
          title: meal.title,
          detail: mealWhen(meal),
          packed: meal.excursion_packed_at !== null,
          toggle: () => deps.actions.setPacked(meal, meal.excursion_packed_at === null),
          open: () => deps.sheet.openMeal(tripId, meal.id),
        }))
    },
  }
}

/** A meal's ingredients in their order — what its sheet and its row read. */
export function ingredientsOfMeal(
  store: ReturnType<typeof useMealStore>,
  mealId: string,
): MealIngredient[] {
  return inOrder(store.ingredientsOf(mealId))
}
