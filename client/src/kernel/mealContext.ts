/**
 * Where the composition root (`App.vue`) binds the meal plan's
 * {@link MealContext} — the shape is `domain/shared/mealContext.ts`, so the meal
 * plan's rules read it without reaching up into `kernel/`.
 */
import type { InjectionKey } from 'vue'

import type { MealContext } from '@/domain/shared/mealContext'

/** The injection key the meal plan reads its context from. */
export const MEAL_CONTEXT = Symbol('mealContext') as InjectionKey<MealContext>
