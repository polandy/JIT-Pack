/** §3.33: the meal plan's rules — pure, so Local Mode keeps every one. */
import { describe, expect, it } from 'vitest'

import type { Meal, MealIngredient } from '@/types/domain'
import {
  boughtShare,
  canMove,
  canTakeAlong,
  earlierDishes,
  excursionFor,
  firstFreeSlot,
  ingredientDue,
  ingredientOnOpenList,
  matchingDishes,
  mealsOn,
  movedMeal,
  parseIngredient,
  placeOf,
  agenda,
  pastMeals,
  planDays,
  slotToPlan,
  startingDay,
  shoppingFigures,
  takesMeal,
} from '../mealPlan'

function meal(id: string, over: Partial<Meal> = {}): Meal {
  return {
    id,
    trip_id: 't1',
    on_date: '2026-10-12',
    slot: 'dinner',
    title: `Gericht ${id}`,
    kind: 'cook',
    at_time: null,
    note: null,
    place: null,
    cook_user_id: null,
    excursion_id: null,
    excursion_packed_at: null,
    ...over,
  }
}

function ingredient(
  id: string,
  mealId: string,
  over: Partial<MealIngredient> = {},
): MealIngredient {
  return {
    id,
    trip_id: 't1',
    meal_id: mealId,
    name: `Zutat ${id}`,
    amount: null,
    list: 'buy_local',
    position: null,
    bought: false,
    bought_at: null,
    bought_by_user_id: null,
    shopping_position: null,
    fresh: null,
    ...over,
  }
}

describe('a meal’s place on the day (FR-33.1)', () => {
  it('stands at its own time, else at its slot’s', () => {
    expect(placeOf(meal('a', { at_time: '19:45' }))).toBe('19:45')
    expect(placeOf(meal('b', { slot: 'breakfast' }))).toBe('08:00')
    expect(placeOf(meal('c', { slot: 'lunch' }))).toBe('12:30')
    expect(placeOf(meal('d', { slot: 'snack' }))).toBe('15:30')
    expect(placeOf(meal('e', { slot: 'dinner', at_time: 'nonsense' }))).toBe('18:30')
  })

  it('lists one day’s meals in the order they are eaten, two in a slot one after the other', () => {
    const meals = [
      meal('dinner'),
      meal('late-lunch', { slot: 'lunch', at_time: '13:30' }),
      meal('breakfast', { slot: 'breakfast' }),
      meal('other-day', { on_date: '2026-10-13', slot: 'breakfast' }),
      meal('second-dinner'),
    ]
    expect(mealsOn(meals, '2026-10-12').map((m) => m.id)).toEqual([
      'breakfast',
      'late-lunch',
      'dinner',
      'second-dinner',
    ])
  })
})

describe('ingredients (FR-33.2, FR-33.3)', () => {
  it('splits a leading amount off the name', () => {
    expect(parseIngredient('500 g Hörnli')).toEqual({ name: 'Hörnli', amount: '500 g' })
    expect(parseIngredient('1 Glas Essiggurken')).toEqual({ name: 'Essiggurken', amount: '1 Glas' })
    expect(parseIngredient('2 Zwiebeln')).toEqual({ name: 'Zwiebeln', amount: '2' })
    expect(parseIngredient('1,5 kg Kartoffeln')).toEqual({ name: 'Kartoffeln', amount: '1,5 kg' })
    expect(parseIngredient('  Salz ')).toEqual({ name: 'Salz', amount: null })
    expect(parseIngredient('7up')).toEqual({ name: '7up', amount: null })
    expect(parseIngredient('   ')).toBeNull()
  })

  it('counts what is bought of a meal', () => {
    const ings = [
      ingredient('a', 'm', { bought: true }),
      ingredient('b', 'm'),
      ingredient('c', 'm'),
    ]
    expect(boughtShare(ings)).toEqual({ bought: 1, total: 3 })
  })

  it('is due on its meal’s day, or on the eve of departure when bought before the trip', () => {
    const m = meal('m', { on_date: '2026-10-14' })
    expect(ingredientDue(m, ingredient('a', 'm'), '2026-10-10')).toBe('2026-10-14')
    expect(ingredientDue(m, ingredient('b', 'm', { list: 'buy_before' }), '2026-10-10')).toBe(
      '2026-10-09',
    )
    expect(ingredientDue(m, ingredient('c', 'm', { list: 'buy_before' }), null)).toBe('2026-10-14')
  })

  it('leaves the open list once its meal’s day has passed — eaten is eaten', () => {
    const today = '2026-10-12'
    expect(ingredientOnOpenList(meal('m', { on_date: '2026-10-11' }), today)).toBe(false)
    expect(ingredientOnOpenList(meal('m', { on_date: '2026-10-12' }), today)).toBe(true)
    expect(ingredientOnOpenList(meal('m', { on_date: '2026-10-15' }), today)).toBe(true)
    expect(ingredientOnOpenList(meal('m', { kind: 'out' }), today)).toBe(false)
  })
})

describe('earlier dishes (FR-33.4)', () => {
  const trips = [
    { id: 't1', name: 'Engadin', start_date: '2026-10-10', end_date: '2026-10-17' },
    { id: 't0', name: 'Tessin', start_date: '2026-05-02', end_date: '2026-05-09' },
    { id: 'tx', name: 'Winter', start_date: '2026-02-07', end_date: '2026-02-14' },
  ]
  const meals = [
    meal('now', { trip_id: 't1', title: 'Fondue' }),
    meal('rösti', { trip_id: 't0', on_date: '2026-05-03', title: 'Rösti mit Spiegelei' }),
    meal('raclette-new', { trip_id: 't0', on_date: '2026-05-05', title: 'Raclette' }),
    meal('raclette-old', { trip_id: 'tx', title: ' raclette ' }),
    meal('out', { trip_id: 't0', title: 'Pizzeria', kind: 'out' }),
  ]
  const ings = [
    ingredient('k', 'rösti', { name: 'Kartoffeln', amount: '1 kg', position: 1, bought: true }),
    ingredient('e', 'rösti', { name: 'Eier', amount: '6', position: 0 }),
    ingredient('r', 'raclette-new', { name: 'Raclettekäse', amount: '600 g' }),
  ]

  it('offers each cooked dish of the other trips once, the newest first, with its ingredients in order', () => {
    const dishes = earlierDishes({ meals, ingredients: ings, trips, tripId: 't1' })
    expect(dishes.map((d) => [d.title, d.tripName])).toEqual([
      ['Raclette', 'Tessin'],
      ['Rösti mit Spiegelei', 'Tessin'],
    ])
    expect(dishes[1]!.ingredients).toEqual([
      { name: 'Eier', amount: '6' },
      { name: 'Kartoffeln', amount: '1 kg' },
    ])
  })

  it('filters by what is typed, at most four', () => {
    const dishes = earlierDishes({ meals, ingredients: ings, trips, tripId: 't1' })
    expect(matchingDishes(dishes, 'rö').map((d) => d.title)).toEqual(['Rösti mit Spiegelei'])
    expect(matchingDishes(dishes, '').length).toBe(2)
    const many = Array.from({ length: 6 }, (_, i) => ({ ...dishes[0]!, title: `D${i}` }))
    expect(matchingDishes(many, '')).toHaveLength(4)
  })
})

describe('the ＋ (M31)', () => {
  const days = ['2026-10-10', '2026-10-11', '2026-10-12']
  it('opens the first empty breakfast, lunch or dinner from today on', () => {
    const meals = [meal('a', { on_date: '2026-10-11', slot: 'breakfast' })]
    expect(firstFreeSlot(meals, days, '2026-10-11')).toEqual({ day: '2026-10-11', slot: 'lunch' })
    expect(firstFreeSlot(meals, days, '2026-09-01')).toEqual({
      day: '2026-10-10',
      slot: 'breakfast',
    })
  })

  it('falls back to today’s dinner on a full plan, and to the last day after the trip', () => {
    const full = days.flatMap((d) =>
      (['breakfast', 'lunch', 'dinner'] as const).map((slot) =>
        meal(`${d}${slot}`, { on_date: d, slot }),
      ),
    )
    expect(firstFreeSlot(full, days, '2026-10-11')).toEqual({ day: '2026-10-11', slot: 'dinner' })
    expect(firstFreeSlot([], days, '2026-11-01')).toEqual({ day: '2026-10-12', slot: 'breakfast' })
  })
})

describe('the picnic in the rucksack (FR-33.6)', () => {
  const excursions = [
    { id: 'late', name: 'Bernina', from: '2026-10-12', to: '2026-10-13' },
    { id: 'early', name: 'Gletscher', from: '2026-10-11', to: '2026-10-12' },
  ]
  it('finds the excursion covering the meal’s day, the one starting first', () => {
    expect(excursionFor('2026-10-12', excursions)?.id).toBe('early')
    expect(excursionFor('2026-10-13', excursions)?.id).toBe('late')
    expect(excursionFor('2026-10-15', excursions)).toBeNull()
  })

  it('is offered a cooked meal at any slot but dinner, on such a day', () => {
    expect(canTakeAlong({ kind: 'cook', slot: 'lunch', on_date: '2026-10-12' }, excursions)).toBe(
      true,
    )
    expect(canTakeAlong({ kind: 'cook', slot: 'dinner', on_date: '2026-10-12' }, excursions)).toBe(
      false,
    )
    expect(canTakeAlong({ kind: 'out', slot: 'lunch', on_date: '2026-10-12' }, excursions)).toBe(
      false,
    )
    expect(canTakeAlong({ kind: 'cook', slot: 'lunch', on_date: '2026-10-15' }, excursions)).toBe(
      false,
    )
  })
})

describe('the plan’s days and its shopping bar (M31)', () => {
  it('lists every day of a trip with both dates, across a month end, and none without', () => {
    expect(planDays('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
    expect(planDays('2026-10-10', null)).toEqual([])
    expect(planDays('2026-10-12', '2026-10-10')).toEqual([])
  })

  it('counts what is still to buy for meals not eaten, and what of it is for today', () => {
    const meals = [
      meal('past', { on_date: '2026-10-11' }),
      meal('today', { on_date: '2026-10-12' }),
      meal('later', { on_date: '2026-10-14' }),
    ]
    const ings = [
      ingredient('a', 'past'),
      ingredient('b', 'today'),
      ingredient('c', 'today', { bought: true }),
      ingredient('d', 'later'),
      ingredient('e', 'gone'),
    ]
    expect(shoppingFigures(meals, ings, '2026-10-12', '2026-10-10')).toEqual({ open: 2, today: 1 })
  })
})

describe('the agenda (M31)', () => {
  const days = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']
  const meals = [
    meal('a', { on_date: '2026-10-10' }),
    meal('b', { on_date: '2026-10-12' }),
    meal('c', { on_date: '2026-10-12', slot: 'lunch' }),
    meal('d', { on_date: '2026-10-15' }),
  ]

  it('stands only the planned days as days, each run of empty ones as one gap, from today on', () => {
    expect(agenda(days, meals, '2026-10-11', false)).toEqual([
      { kind: 'gap', days: ['2026-10-11'] },
      { kind: 'day', day: '2026-10-12' },
      { kind: 'gap', days: ['2026-10-13', '2026-10-14'] },
      { kind: 'day', day: '2026-10-15' },
    ])
  })

  it('adds the days behind when asked, and shows the whole trip before it starts and after it ended', () => {
    expect(agenda(days, meals, '2026-10-11', true)[0]).toEqual({ kind: 'day', day: '2026-10-10' })
    expect(agenda(days, meals, '2026-09-01', false)[0]).toEqual({ kind: 'day', day: '2026-10-10' })
    expect(agenda(days, meals, '2026-11-01', false)).toHaveLength(5)
  })

  it('is one gap for a trip with nothing planned', () => {
    expect(agenda(days, [], '2026-09-01', false)).toEqual([{ kind: 'gap', days }])
  })

  it('folds the meals of the days behind, and starts an empty plan tonight or on the first day', () => {
    expect(pastMeals(meals, '2026-10-12').map((m) => m.id)).toEqual(['a'])
    expect(startingDay(days, '2026-10-12')).toBe('2026-10-12')
    expect(startingDay(days, '2026-09-01')).toBe('2026-10-10')
    expect(startingDay(days, '2026-11-01')).toBe('2026-10-15')
  })
})

describe('a day’s ＋ (M31)', () => {
  it('opens on dinner while it is free, then lunch, then breakfast, and dinner on a full day', () => {
    const day = '2026-10-12'
    expect(slotToPlan([], day)).toBe('dinner')
    expect(slotToPlan([meal('d', { on_date: day })], day)).toBe('lunch')
    expect(
      slotToPlan([meal('d', { on_date: day }), meal('l', { on_date: day, slot: 'lunch' })], day),
    ).toBe('breakfast')
    const full = (['breakfast', 'lunch', 'dinner'] as const).map((slot) =>
      meal(slot, { on_date: day, slot }),
    )
    expect(slotToPlan(full, day)).toBe('dinner')
    expect(slotToPlan([meal('other', { on_date: '2026-10-13' })], day)).toBe('dinner')
  })
})

describe('a meal moved to another day (FR-33.15)', () => {
  const today = '2026-10-12'
  const excursions = [
    { id: 'bernina', name: 'Bernina', from: '2026-10-14', to: '2026-10-14' },
    { id: 'roseg', name: 'Val Roseg', from: '2026-10-16', to: '2026-10-16' },
  ]

  it('is moved while it is still ahead — today’s too, never one already eaten', () => {
    expect(canMove(meal('m', { on_date: '2026-10-12' }), today)).toBe(true)
    expect(canMove(meal('m', { on_date: '2026-10-15' }), today)).toBe(true)
    expect(canMove(meal('m', { on_date: '2026-10-11' }), today)).toBe(false)
  })

  it('lands on today or a day ahead, never on a day behind', () => {
    expect(takesMeal('2026-10-12', today)).toBe(true)
    expect(takesMeal('2026-10-17', today)).toBe(true)
    expect(takesMeal('2026-10-11', today)).toBe(false)
  })

  it('changes its day and nothing else of a meal on no excursion', () => {
    expect(
      movedMeal(meal('m', { on_date: '2026-10-12', at_time: '19:00' }), '2026-10-14', excursions),
    ).toEqual({ on_date: '2026-10-14', slot: 'dinner', at_time: '19:00', excursion_id: null })
  })

  it('leaves its excursion for a day no excursion covers', () => {
    const picnic = meal('m', { on_date: '2026-10-14', slot: 'lunch', excursion_id: 'bernina' })
    expect(movedMeal(picnic, '2026-10-13', excursions)).toMatchObject({
      on_date: '2026-10-13',
      excursion_id: null,
    })
  })

  it('goes along on the excursion of the day it is moved to, as the sheet would take it', () => {
    const picnic = meal('m', { on_date: '2026-10-14', slot: 'lunch', excursion_id: 'bernina' })
    expect(movedMeal(picnic, '2026-10-16', excursions)).toMatchObject({
      on_date: '2026-10-16',
      excursion_id: 'roseg',
    })
  })

  it('takes another slot, and drops a time that belonged to the old one', () => {
    const raclette = meal('m', { on_date: '2026-10-12', slot: 'dinner', at_time: '19:00' })
    expect(movedMeal(raclette, '2026-10-12', excursions, 'lunch')).toEqual({
      on_date: '2026-10-12',
      slot: 'lunch',
      at_time: null,
      excursion_id: null,
    })
  })

  it('keeps its time when the slot it is given is its own', () => {
    const raclette = meal('m', { on_date: '2026-10-12', slot: 'dinner', at_time: '19:00' })
    expect(movedMeal(raclette, '2026-10-13', excursions, 'dinner').at_time).toBe('19:00')
  })

  it('leaves the rucksack when the picnic becomes a dinner, which is never taken along', () => {
    const picnic = meal('m', { on_date: '2026-10-14', slot: 'lunch', excursion_id: 'bernina' })
    expect(movedMeal(picnic, '2026-10-14', excursions, 'dinner').excursion_id).toBeNull()
  })

  it('is not put on an excursion it was not taken on', () => {
    const lunch = meal('m', { on_date: '2026-10-13', slot: 'lunch' })
    expect(movedMeal(lunch, '2026-10-14', excursions).excursion_id).toBeNull()
  })
})
