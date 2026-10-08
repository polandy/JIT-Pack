/**
 * What the meal plan remembers of its ingredients and how the shopping list
 * adds them up (FR-33.12–33.14, ADR-093) — pure, so Local Mode keeps every
 * rule. The names live in the meals themselves: there is no catalogue.
 */
import { foldSearch, spellOutUmlauts } from '@/domain/search'
import { daysBetween } from '@/lib/dueDay'
import type { MealTrip } from '@/kernel/mealContext'
import type { Meal, MealIngredient } from '@/types/domain'
import { parseIngredient } from './mealPlan'
import { namedTotal, unitOf, type Unit, type UnitFamily } from './units'

/** How many remembered ingredients the field offers at once (FR-33.12). */
export const MAX_SUGGESTIONS = 5

/**
 * How many days after a line's first part a fresh part may still be due and
 * be summed into it (FR-33.14): the same day's and the next day's.
 */
export const FRESH_SPAN_DAYS = 1

/**
 * What makes two ingredients one name (FR-33.14): case and spaces aside, and
 * nothing more — „Müesli" and „Muesli" stay two, as two people may mean them.
 */
export function ingredientKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * The fresh food a name is first taken for (FR-33.13), folded — matched at
 * the end of the name's last word, since a German compound names its head
 * last: *Schlagrahm* is cream, *Milchschokolade* is chocolate.
 */
const FRESH_FOOD: readonly string[] = [
  // German
  'milch',
  'rahm',
  'sahne',
  'joghurt',
  'jogurt',
  'quark',
  'mozzarella',
  'ricotta',
  'fleisch',
  'hack',
  'poulet',
  'huhn',
  'hahnchen',
  'wurstchen',
  'fisch',
  'lachs',
  'forelle',
  'crevetten',
  'salat',
  'beeren',
  'brot',
  'brotchen',
  'burli',
  'gipfeli',
  'zopf',
  'kraut',
  'krauter',
  'basilikum',
  'petersilie',
  'schnittlauch',
  // English
  'milk',
  'cream',
  'yoghurt',
  'yogurt',
  'meat',
  'mince',
  'beef',
  'pork',
  'chicken',
  'fish',
  'salmon',
  'salad',
  'lettuce',
  'berries',
  'bread',
  'rolls',
  'herbs',
  'basil',
]

/** Whether the built-in list takes a name for fresh food (FR-33.13). */
export function builtInFresh(name: string): boolean {
  const last = foldSearch(name.trim()).split(/\s+/).pop() ?? ''
  return FRESH_FOOD.some((food) => last.endsWith(food))
}

/**
 * The last freshness set for each name on the device (FR-33.13): the newest
 * meal whose ingredient of that name has one decides, keyed by
 * {@link ingredientKey}.
 */
export function learnedFreshness(
  meals: readonly Pick<Meal, 'id' | 'on_date'>[],
  ingredients: readonly MealIngredient[],
): Map<string, boolean> {
  const dayOf = new Map(meals.map((meal) => [meal.id, meal.on_date]))
  const newest = new Map<string, { day: string; fresh: boolean }>()
  for (const ingredient of ingredients) {
    if (ingredient.fresh === null) continue
    const day = dayOf.get(ingredient.meal_id)
    if (day === undefined) continue
    const key = ingredientKey(ingredient.name)
    const known = newest.get(key)
    if (!known || day > known.day) newest.set(key, { day, fresh: ingredient.fresh })
  }
  return new Map([...newest].map(([key, { fresh }]) => [key, fresh]))
}

/** Whether an ingredient is fresh: its own setting, else its name's last, else the built-in list's. */
export function isFresh(
  ingredient: Pick<MealIngredient, 'name' | 'fresh'>,
  learned: ReadonlyMap<string, boolean>,
): boolean {
  return freshByName(ingredient.name, learned, ingredient.fresh)
}

/** The freshness a name brings to a new ingredient (FR-33.12/33.13). */
export function freshByName(
  name: string,
  learned: ReadonlyMap<string, boolean>,
  own: boolean | null = null,
): boolean {
  return own ?? learned.get(ingredientKey(name)) ?? builtInFresh(name)
}

/** An ingredient of an earlier meal, offered while one is typed (FR-33.12). */
export interface IngredientSuggestion {
  name: string
  /** The amount used last — the newest meal's; null where it had none. */
  amount: string | null
  /** How many ingredients carry the name. */
  uses: number
  /** The trip it was used last on; null where the device no longer holds it. */
  tripName: string | null
  tripStart: string | null
  fresh: boolean
}

/**
 * The ingredients the field offers for what is typed (FR-33.12): every meal's
 * on the device, one per name, matched from the name's start under both
 * spellings of an umlaut (FR-24.7), the most used first, at most
 * {@link MAX_SUGGESTIONS}, none the meal already holds (`taken`). An amount
 * typed in front is not part of the name looked for.
 */
export function ingredientSuggestions(input: {
  meals: readonly Meal[]
  ingredients: readonly MealIngredient[]
  trips: readonly MealTrip[]
  typed: string
  taken: readonly string[]
}): IngredientSuggestion[] {
  const query = parseIngredient(input.typed)?.name ?? ''
  if (query === '') return []
  const mealOf = new Map(input.meals.map((meal) => [meal.id, meal]))
  const tripOf = new Map(input.trips.map((trip) => [trip.id, trip]))
  const taken = new Set(input.taken.map(ingredientKey))
  const learned = learnedFreshness(input.meals, input.ingredients)
  const byName = new Map<string, { newest: MealIngredient; day: string; uses: number }>()
  for (const ingredient of input.ingredients) {
    const key = ingredientKey(ingredient.name)
    if (key === '' || taken.has(key) || !startsWith(ingredient.name, query)) continue
    const day = mealOf.get(ingredient.meal_id)?.on_date ?? ''
    const known = byName.get(key)
    if (!known) byName.set(key, { newest: ingredient, day, uses: 1 })
    else {
      known.uses++
      if (day > known.day) Object.assign(known, { newest: ingredient, day })
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.uses - a.uses || a.newest.name.localeCompare(b.newest.name))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ newest, uses }) => {
      const trip = tripOf.get(newest.trip_id)
      return {
        name: newest.name.trim(),
        amount: newest.amount,
        uses,
        tripName: trip?.name ?? null,
        tripStart: trip?.start_date ?? null,
        fresh: freshByName(newest.name, learned),
      }
    })
}

function startsWith(name: string, query: string): boolean {
  return (
    foldSearch(name.trim()).startsWith(foldSearch(query)) ||
    spellOutUmlauts(name.trim()).startsWith(spellOutUmlauts(query))
  )
}

/** One part of a summed amount: a number in a unit (`''` for a count), or text that adds up to nothing. */
export type AmountTotal = { value: number; unit: string } | { text: string }

/** A family's total in the unit it reads best in — the larger one once it reaches one. */
function display(family: UnitFamily, base: number): { value: number; unit: string } {
  if (family === 'mass') return base >= 1000 ? scaled(base, 1000, 'kg') : scaled(base, 1, 'g')
  if (family === 'volume') {
    if (base >= 1000) return scaled(base, 1000, 'l')
    return base >= 100 ? scaled(base, 100, 'dl') : scaled(base, 1, 'ml')
  }
  return scaled(base, 1, '')
}

/** A base amount in a unit, to two decimals so float noise never reads as a quantity. */
function scaled(base: number, factor: number, unit: string): { value: number; unit: string } {
  return { value: Math.round((base / factor) * 100) / 100, unit }
}

const AMOUNT = /^(\d+(?:[.,]\d+)?)\s*(.*)$/

/** A running total of one unit (or family): its base amount and the spelling it was first typed in. */
interface Running {
  unit: Unit | undefined
  base: number
  spelling: string
}

/**
 * What a line's amounts add up to (FR-33.14), by `units.ts`: a mass with
 * masses, a volume with volumes, a bare count with pieces, and one named unit
 * with itself in any spelling, written in the first one's words (*1 Glas* +
 * *2 Gläser* = *3 Gläser*). A unit the table does not hold adds only to the
 * same word. What does not add up stands beside it in the order it came, and
 * no amount adds nothing.
 */
export function sumAmounts(amounts: readonly (string | null)[]): AmountTotal[] {
  const totals = new Map<string, Running | { text: string }>()
  for (const raw of amounts) {
    const amount = raw?.trim() ?? ''
    if (amount === '') continue
    const match = AMOUNT.exec(amount)
    if (!match) {
      totals.set(`text:${totals.size}`, { text: amount })
      continue
    }
    const value = Number(match[1]!.replace(',', '.'))
    const spelling = match[2]!.trim()
    const unit = spelling === '' ? unitOf('Stk.') : unitOf(spelling)
    const key = !unit
      ? `word:${spelling.toLowerCase()}`
      : unit.family === 'named'
        ? `named:${unit.id}`
        : unit.family
    const base = value * (unit?.factor ?? 1)
    const known = totals.get(key)
    if (known && 'base' in known) known.base += base
    else totals.set(key, { unit, base, spelling })
  }
  return [...totals.values()].map((total) => {
    if ('text' in total) return total
    const { unit, base, spelling } = total
    if (!unit) return { value: scaled(base, 1, '').value, unit: spelling }
    if (unit.family === 'named') {
      const value = scaled(base, 1, '').value
      return { value, unit: namedTotal(unit, spelling, value) }
    }
    return display(unit.family, base)
  })
}

/** What a part tells the summing rule: its name's key, its due day and whether it is fresh. */
export interface SumFacts {
  key: string
  due: string
  fresh: boolean
}

/**
 * The open ingredients that make one line of the shopping list (FR-33.14):
 * one name's, all of a durable name's, a fresh name's only while they are due
 * at most {@link FRESH_SPAN_DAYS} after the line's first — counted from the
 * first, so a week of cream never chains into one line. A name is fresh when
 * any of its parts is. The parts come in the order they are read in; the
 * lines are ordered by their first part.
 */
export function sumGroups<T>(parts: readonly T[], facts: (part: T) => SumFacts): T[][] {
  const known = parts.map((part, index) => ({ part, index, ...facts(part) }))
  const freshNames = new Set(known.filter((p) => p.fresh).map((p) => p.key))
  const ordered = [...known].sort((a, b) => a.due.localeCompare(b.due) || a.index - b.index)
  const open = new Map<string, { first: string; parts: typeof known }>()
  const lines: (typeof known)[] = []
  for (const part of ordered) {
    const line = open.get(part.key)
    const fits =
      line && (!freshNames.has(part.key) || daysBetween(line.first, part.due) <= FRESH_SPAN_DAYS)
    if (line && fits) line.parts.push(part)
    else {
      const started = { first: part.due, parts: [part] }
      open.set(part.key, started)
      lines.push(started.parts)
    }
  }
  return lines
    .map((line) => [...line].sort((a, b) => a.index - b.index))
    .sort((a, b) => a[0]!.index - b[0]!.index)
    .map((line) => line.map(({ part }) => part))
}
