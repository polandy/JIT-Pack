/**
 * The meal plan's rows as the client holds them (§3.33, ADR-092) — vocabulary
 * of the module's own, beside its catalogue, so its domain rules and its store
 * read them without a kernel file naming them.
 */
import { COLUMN_ENUMS, type ColumnEnum } from '@/api/tables'
import type { ShoppingMode } from '@/types/domain'

/** FR-33.1: the four places of a day a meal stands at, in the day's order. */
export const MEAL_SLOTS = COLUMN_ENUMS.meals.slot
export type MealSlot = (typeof MEAL_SLOTS)[number]
export const MEAL_SLOT_BREAKFAST = 'breakfast' as const satisfies MealSlot
export const MEAL_SLOT_LUNCH = 'lunch' as const satisfies MealSlot
export const MEAL_SLOT_SNACK = 'snack' as const satisfies MealSlot
export const MEAL_SLOT_DINNER = 'dinner' as const satisfies MealSlot

/** FR-33.1: cooked by the travellers, with ingredients, or eaten out. */
export type MealKind = ColumnEnum<'meals', 'kind'>
export const MEAL_KIND_COOK = 'cook' as const satisfies MealKind
export const MEAL_KIND_OUT = 'out' as const satisfies MealKind

/** FR-33.1: a meal of the trip's meal plan. */
export interface Meal {
  id: string
  trip_id: string
  /** `YYYY-MM-DD`. */
  on_date: string
  slot: MealSlot
  /** The dish. */
  title: string
  kind: MealKind
  /** `HH:MM`, or null for one that stands at its slot's place. */
  at_time: string | null
  note: string | null
  /** Eaten out: where; null otherwise. */
  place: string | null
  /** FR-33.8: who cooks it, a member's user id; null for nobody named. */
  cook_user_id: string | null
  /** FR-33.6: the excursion a picnic is taken on; null for none. */
  excursion_id: string | null
  /** FR-33.6: when it went into that excursion's rucksack; null while it is not. */
  excursion_packed_at: string | null
}

/** FR-33.2: an ingredient of a meal — and a line of the shopping list (FR-33.3). */
export interface MealIngredient {
  id: string
  trip_id: string
  meal_id: string
  name: string
  /** Free text as typed — „500 g", „1 Glas" — summed on M6 only (FR-33.14); null for none. */
  amount: string | null
  list: ShoppingMode
  /** Its order in the meal. */
  position: number | null
  bought: boolean
  /** FR-30.4: the tap's time; null while it is not bought. */
  bought_at: string | null
  /** FR-30.4: stamped by the server (invariant 3); null in Local Mode. */
  bought_by_user_id: string | null
  /** FR-30.13: its place on M6, by hand; null for never placed (ADR-083). */
  shopping_position: number | null
  /**
   * FR-33.13: fresh or durable, as somebody set it; null for never set, when
   * `isFresh` asks the name's last setting and the built-in list.
   */
  fresh: boolean | null
}
