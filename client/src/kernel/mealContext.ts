/**
 * What the meal plan reads of the rest of the trip (§3.33) — the trips on the
 * device for earlier dishes (FR-33.4), a trip's excursions for a picnic
 * (FR-33.6), its shortlisted ideas for where to eat out (M31).
 *
 * The meal plan is a feature module and may import neither the packing side
 * nor the planner (`scripts/module-boundary-gate.mjs`), so the composition
 * root (`App.vue`) answers these reads from their stores and hands them in —
 * `shoppingSources.ts`'s arrangement, the other way round.
 */
import type { InjectionKey } from 'vue'

/** A trip as the meal plan names it. */
export interface MealTrip {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
}

/** An excursion as a picnic is taken on it: its name and its days (`YYYY-MM-DD`). */
export interface MealExcursion {
  id: string
  name: string
  from: string
  to: string
}

/** A shortlisted idea, offered as a place to eat out. */
export interface MealPlaceIdea {
  id: string
  title: string
}

export interface MealContext {
  /** Every trip on the device. */
  trips(): MealTrip[]
  /** A trip's excursions that have days. */
  excursions(tripId: string): MealExcursion[]
  /** A trip's shortlisted ideas. */
  shortlist(tripId: string): MealPlaceIdea[]
}

/** The injection key the meal plan reads its context from. */
export const MEAL_CONTEXT = Symbol('mealContext') as InjectionKey<MealContext>
