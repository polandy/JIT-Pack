/**
 * The meal plan's public face (§3.33, FR-33.10) — what the composition root,
 * the router and the dev seed may reach. Nothing else imports the module.
 */
export { createMealActions, type MealActions } from './actions'
export { mealActivityReaders } from './domain/activity'
export { default as MealSheet } from './MealSheet.vue'
export { default as MealsTodayCard } from './MealsTodayCard.vue'
export { useMealSheet } from './sheet'
export {
  createMealDayPlanSource,
  createMealExcursionSource,
  createMealShoppingSource,
  type MealSourceDeps,
} from './sources'
export { mealFeatureStore, useMealStore } from './store'

/** The module's rows and their vocabulary, for the composition root and the dev seed. */
export * from './types'
