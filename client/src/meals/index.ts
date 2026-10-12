/**
 * The meal plan's public face (§3.33, FR-33.10) — what the composition root,
 * the router and the dev seed may reach. Nothing else imports the module.
 */
import type { FeatureModule } from '@/kernel/moduleContribution'
import { createMealActions } from './actions'
import { mealActivityReaders } from './domain/activity'
import MealSheet from './MealSheet.vue'
import MealsTodayCard from './MealsTodayCard.vue'
import { useMealSheet } from './sheet'
import {
  createMealDayPlanSource,
  createMealExcursionSource,
  createMealShoppingSource,
  type MealSourceDeps,
} from './sources'
import { mealFeatureStore, useMealStore } from './store'

export { createMealActions, type MealActions } from './actions'
export { useMealStore }

/** The module's registration (ADR-066 amendment 3), folded by the composition root. */
export const mealsModule: FeatureModule = {
  featureStore: mealFeatureStore,
  contribute(host) {
    const deps: MealSourceDeps = {
      store: useMealStore(),
      actions: createMealActions(host.module, useMealStore()),
      sheet: useMealSheet(),
      context: host.mealContext,
      today: host.today,
    }
    return {
      activityReaders: mealActivityReaders,
      // FR-33.7: today's meals, a block of their own beside today's plan.
      tripCards: [MealsTodayCard],
      // The one meal sheet, opened from M31, the day plan, an excursion and M1.
      shell: [MealSheet],
      // FR-33.3: a meal's ingredients, under the meal plan's heading.
      shoppingSources: [createMealShoppingSource(deps)],
      // FR-33.5: the meals, each at its time or its slot's place.
      dayPlanSources: [createMealDayPlanSource(deps)],
      // FR-33.6: a picnic on its excursion's list, counted in the rucksack's share.
      excursionExtraLines: [createMealExcursionSource(deps)],
    }
  },
}

/** The module's rows and their vocabulary, for the composition root and the dev seed. */
export * from './types'
