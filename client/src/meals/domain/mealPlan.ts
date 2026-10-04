/**
 * The meal plan's rules (§3.33) — pure, so Local Mode keeps every one and a
 * spec needs no component to reach them. What a day holds and in which order,
 * what of an ingredient stands on the shopping list and when it is due, which
 * earlier dishes are offered, where the ＋ opens and whether a meal may go on
 * an excursion.
 */
import { daysBetween } from '@/lib/dueDay'
import type { MealExcursion, MealTrip } from '@/lib/mealContext'
import type { Meal, MealIngredient, MealKind, MealSlot } from '@/types/domain'
import {
  ITEM_MODE_BUY_BEFORE,
  MEAL_KIND_COOK,
  MEAL_SLOT_BREAKFAST,
  MEAL_SLOT_DINNER,
  MEAL_SLOT_LUNCH,
  MEAL_SLOTS,
} from '@/types/domain'

/**
 * Where a meal without a time stands on its day (FR-33.1) — it orders the
 * meal among the timed lines and nothing else.
 */
export const SLOT_PLACE: Record<MealSlot, string> = {
  breakfast: '08:00',
  lunch: '12:30',
  snack: '15:30',
  dinner: '18:30',
}

/** The slots a day always shows a row for; the snack has one only while it holds a meal (M31). */
export const STANDING_SLOTS: readonly MealSlot[] = [
  MEAL_SLOT_BREAKFAST,
  MEAL_SLOT_LUNCH,
  MEAL_SLOT_DINNER,
]

/** How many earlier dishes the sheet offers at once. */
export const MAX_DISHES = 4

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Whether a stored time is one the plan can order by. */
export function isMealTime(value: string | null | undefined): value is string {
  return typeof value === 'string' && HH_MM.test(value)
}

/** A meal's place on its day: its own time, else its slot's. */
export function placeOf(meal: Pick<Meal, 'at_time' | 'slot'>): string {
  return isMealTime(meal.at_time) ? meal.at_time : SLOT_PLACE[meal.slot]
}

/**
 * One day's meals in the order they are eaten: by place, then by slot, and
 * two meals of one slot in the order they came (FR-33.1).
 */
export function mealsOn(meals: readonly Meal[], day: string): Meal[] {
  return meals
    .map((meal, index) => ({ meal, index }))
    .filter(({ meal }) => meal.on_date === day)
    .sort(
      (a, b) =>
        placeOf(a.meal).localeCompare(placeOf(b.meal)) ||
        MEAL_SLOTS.indexOf(a.meal.slot) - MEAL_SLOTS.indexOf(b.meal.slot) ||
        a.index - b.index,
    )
    .map(({ meal }) => meal)
}

/** A meal's ingredients in its own order. */
export function inOrder(ingredients: readonly MealIngredient[]): MealIngredient[] {
  return ingredients
    .map((ingredient, index) => ({ ingredient, index }))
    .sort(
      (a, b) =>
        (a.ingredient.position ?? Number.MAX_SAFE_INTEGER) -
          (b.ingredient.position ?? Number.MAX_SAFE_INTEGER) || a.index - b.index,
    )
    .map(({ ingredient }) => ingredient)
}

/** How much of a meal is bought. */
export function boughtShare(ingredients: readonly MealIngredient[]): {
  bought: number
  total: number
} {
  return {
    bought: ingredients.filter((ingredient) => ingredient.bought).length,
    total: ingredients.length,
  }
}

/** A leading amount: a number (with a decimal comma or point) and an optional unit. */
const LEADING_AMOUNT =
  /^(\d+(?:[.,]\d+)?\s*(?:g|kg|mg|l|dl|cl|ml|el|tl|stk\.?|stück|glas|gläser|dose|dosen|pck\.?|packung|fl\.?|flasche|bund|prise)?)\s+(.+)$/i

/**
 * What the ingredient field's text means (FR-33.2): *„500 g Hörnli"* is
 * Hörnli, 500 g. Null for nothing typed.
 */
export function parseIngredient(text: string): { name: string; amount: string | null } | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const match = LEADING_AMOUNT.exec(trimmed)
  return match
    ? { name: match[2]!.trim(), amount: match[1]!.trim() }
    : { name: trimmed, amount: null }
}

/**
 * The day an ingredient is due (FR-33.3): its meal's — or, bought before the
 * trip, the eve of departure (FR-30.10's *Vor Abreise*), the meal's day where
 * the trip has no start.
 */
export function ingredientDue(
  meal: Pick<Meal, 'on_date'>,
  ingredient: Pick<MealIngredient, 'list'>,
  tripStart: string | null,
): string {
  if (ingredient.list === ITEM_MODE_BUY_BEFORE && tripStart) return dayBefore(tripStart)
  return meal.on_date
}

/**
 * Whether a meal's open ingredients still stand on the open list (FR-33.3):
 * a cooked meal's, until its day has passed — eaten is eaten.
 */
export function ingredientOnOpenList(meal: Pick<Meal, 'on_date' | 'kind'>, today: string): boolean {
  return meal.kind === MEAL_KIND_COOK && daysBetween(today, meal.on_date) >= 0
}

/** A dish cooked on another trip, offered on a new meal (FR-33.4). */
export interface EarlierDish {
  title: string
  tripId: string
  tripName: string
  tripStart: string | null
  ingredients: { name: string; amount: string | null }[]
}

/**
 * The dishes of earlier meals (FR-33.4): every cooked meal of every other
 * trip, the newest trip first, one per dish (by its title, case and spaces
 * aside — the newest wins), with its ingredients in its own order.
 */
export function earlierDishes(input: {
  meals: readonly Meal[]
  ingredients: readonly MealIngredient[]
  trips: readonly MealTrip[]
  tripId: string
}): EarlierDish[] {
  const tripOf = new Map(input.trips.map((trip) => [trip.id, trip]))
  const candidates = input.meals
    .filter((meal) => meal.trip_id !== input.tripId && meal.kind === MEAL_KIND_COOK)
    .filter((meal) => meal.title.trim() !== '' && tripOf.has(meal.trip_id))
    .sort(
      (a, b) =>
        (tripOf.get(b.trip_id)!.start_date ?? '').localeCompare(
          tripOf.get(a.trip_id)!.start_date ?? '',
        ) || b.on_date.localeCompare(a.on_date),
    )
  const seen = new Set<string>()
  const dishes: EarlierDish[] = []
  for (const meal of candidates) {
    const key = dishKey(meal.title)
    if (seen.has(key)) continue
    seen.add(key)
    const trip = tripOf.get(meal.trip_id)!
    dishes.push({
      title: meal.title.trim(),
      tripId: trip.id,
      tripName: trip.name,
      tripStart: trip.start_date,
      ingredients: inOrder(input.ingredients.filter((ing) => ing.meal_id === meal.id)).map(
        (ing) => ({ name: ing.name, amount: ing.amount }),
      ),
    })
  }
  return dishes
}

/** The earlier dishes whose title holds what is typed, at most {@link MAX_DISHES}. */
export function matchingDishes(dishes: readonly EarlierDish[], typed: string): EarlierDish[] {
  const query = dishKey(typed)
  return dishes
    .filter((dish) => query === '' || dishKey(dish.title).includes(query))
    .slice(0, MAX_DISHES)
}

function dishKey(title: string): string {
  return title.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

/**
 * Where the ＋ opens a new meal (M31): the first empty breakfast, lunch or
 * dinner from today on — the first day before the trip, the last after it —
 * and today's dinner when every one is taken.
 */
export function firstFreeSlot(
  meals: readonly Meal[],
  days: readonly string[],
  today: string,
): { day: string; slot: MealSlot } {
  const from =
    days.find((day) => day >= today) ??
    (days.length > 0 && today > days[days.length - 1]! ? days[days.length - 1]! : today)
  for (const day of days.filter((d) => d >= from)) {
    for (const slot of STANDING_SLOTS) {
      if (!meals.some((meal) => meal.on_date === day && meal.slot === slot)) return { day, slot }
    }
  }
  return { day: from, slot: MEAL_SLOT_DINNER }
}

/** The excursion covering a day, the one starting first; null for none (FR-33.6). */
export function excursionFor(
  day: string,
  excursions: readonly MealExcursion[],
): MealExcursion | null {
  return (
    [...excursions]
      .filter((excursion) => excursion.from <= day && day <= excursion.to)
      .sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name))[0] ?? null
  )
}

/**
 * Whether a meal may be taken on an excursion (FR-33.6): cooked, at any slot
 * but dinner, on a day an excursion covers.
 */
export function canTakeAlong(
  meal: { kind: MealKind; slot: MealSlot; on_date: string },
  excursions: readonly MealExcursion[],
): boolean {
  return (
    meal.kind === MEAL_KIND_COOK &&
    meal.slot !== MEAL_SLOT_DINNER &&
    excursionFor(meal.on_date, excursions) !== null
  )
}

/** The calendar day before an ISO day, through UTC so no zone moves it. */
function dayBefore(iso: string): string {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
}

/** The longest trip whose days are listed — a typo'd year must not draw ten thousand days. */
export const MAX_MEAL_DAYS = 120

/** Every day of a trip with both dates, in order; empty without them (FR-33.1). */
export function planDays(start: string | null, end: string | null): string[] {
  if (!start || !end || end < start) return []
  const days: string[] = []
  for (let day = start; day <= end && days.length < MAX_MEAL_DAYS; day = dayAfter(day)) {
    days.push(day)
  }
  return days
}

/**
 * The shopping bar's two figures (M31): the ingredients still to buy for
 * meals not yet eaten, and how many of them are due today (FR-33.3).
 */
export function shoppingFigures(
  meals: readonly Meal[],
  ingredients: readonly MealIngredient[],
  today: string,
  tripStart: string | null,
): { open: number; today: number } {
  const mealOf = new Map(meals.map((meal) => [meal.id, meal]))
  let open = 0
  let dueToday = 0
  for (const ingredient of ingredients) {
    const meal = mealOf.get(ingredient.meal_id)
    if (ingredient.bought || !meal || !ingredientOnOpenList(meal, today)) continue
    open++
    if (daysBetween(today, ingredientDue(meal, ingredient, tripStart)) <= 0) dueToday++
  }
  return { open, today: dueToday }
}

/** The calendar day after an ISO day, through UTC so no zone moves it. */
function dayAfter(iso: string): string {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

/** One stretch of the agenda (M31): a day that holds meals, or a run of days that holds none. */
export type AgendaItem = { kind: 'day'; day: string } | { kind: 'gap'; days: string[] }

/**
 * The agenda M31 draws: only the days that
 * hold a meal stand as days; a run of days between them that holds none is
 * one item, drawn as a single line — meals are planned now and then, not for
 * every day. From today on during the trip, every day before it and after it;
 * `withPast` adds the days already behind.
 */
export function agenda(
  days: readonly string[],
  meals: readonly Pick<Meal, 'on_date'>[],
  today: string,
  withPast: boolean,
): AgendaItem[] {
  const planned = new Set(meals.map((meal) => meal.on_date))
  const shown =
    withPast || !days.some((day) => day >= today) ? days : days.filter((day) => day >= today)
  const items: AgendaItem[] = []
  let gap: string[] = []
  const flush = () => {
    if (gap.length > 0) items.push({ kind: 'gap', days: gap })
    gap = []
  }
  for (const day of shown) {
    if (planned.has(day)) {
      flush()
      items.push({ kind: 'day', day })
    } else gap.push(day)
  }
  flush()
  return items
}

/** The meals already eaten — on a day before today — which M31 folds into one line. */
export function pastMeals<T extends Pick<Meal, 'on_date'>>(
  meals: readonly T[],
  today: string,
): T[] {
  return meals.filter((meal) => meal.on_date < today)
}

/**
 * Where a meal planned from the empty plan goes (M31): tonight's dinner during
 * the trip, else the first day's.
 */
export function startingDay(days: readonly string[], today: string): string {
  return days.includes(today)
    ? today
    : (days.find((day) => day >= today) ?? days[days.length - 1] ?? today)
}

/** The order a day's ＋ fills its slots in: dinner first, since a single planned meal is most often one. */
const PLAN_ORDER: readonly MealSlot[] = [MEAL_SLOT_DINNER, MEAL_SLOT_LUNCH, MEAL_SLOT_BREAKFAST]

/**
 * The slot a new meal on a given day opens on (M31): its dinner while that is
 * free, then lunch, then breakfast — and dinner again on a full day.
 */
export function slotToPlan(
  meals: readonly Pick<Meal, 'on_date' | 'slot'>[],
  day: string,
): MealSlot {
  const taken = new Set(meals.filter((meal) => meal.on_date === day).map((meal) => meal.slot))
  return PLAN_ORDER.find((slot) => !taken.has(slot)) ?? MEAL_SLOT_DINNER
}
