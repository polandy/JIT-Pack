/**
 * FR-33.12–33.14: remembering ingredients across trips, telling fresh from
 * durable, and summing one name's ingredients on the shopping list — pure,
 * so Local Mode keeps every rule.
 */
import { describe, expect, it } from 'vitest'

import type { MealTrip } from '@/domain/shared/mealContext'
import type { Meal, MealIngredient } from '@/types/domain'
import {
  builtInFresh,
  ingredientKey,
  ingredientSuggestions,
  isFresh,
  learnedFreshness,
  sumAmounts,
  sumGroups,
} from '../ingredients'

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

const TRIPS: MealTrip[] = [
  { id: 't1', name: 'Engadin Herbst', start_date: '2026-10-10', end_date: '2026-10-17' },
  { id: 't0', name: 'Engadin Feb.', start_date: '2026-02-07', end_date: '2026-02-14' },
  { id: 'tm', name: 'Tessin Mai', start_date: '2026-05-01', end_date: '2026-05-08' },
]

describe('ingredientKey (FR-33.14)', () => {
  it('is one name whatever its case and spaces', () => {
    expect(ingredientKey('  Butter ')).toBe(ingredientKey('butter'))
    expect(ingredientKey('Crème  fraîche')).toBe(ingredientKey('crème fraîche'))
  })

  it('keeps names apart that only the search fold would join', () => {
    expect(ingredientKey('Müesli')).not.toBe(ingredientKey('Muesli'))
  })
})

describe('builtInFresh (FR-33.13)', () => {
  it.each([
    ['Milch', true],
    ['Vollmilch', true],
    ['Schlagrahm', true],
    ['Hackfleisch', true],
    ['Bündnerfleisch', true],
    ['Erdbeeren', true],
    ['Bürli', true],
    ['ground beef', true],
    ['Fresh Cream', true],
    ['Milchschokolade', false],
    ['Butter', false],
    ['Reis', false],
    ['Kartoffeln', false],
    ['Eier', false],
  ])('%s → fresh %s', (name, fresh) => {
    expect(builtInFresh(name)).toBe(fresh)
  })
})

describe('learnedFreshness / isFresh (FR-33.13)', () => {
  it('takes the setting of the newest meal whose ingredient of that name has one', () => {
    const meals = [
      meal('old', { trip_id: 't0', on_date: '2026-02-08' }),
      meal('new', { trip_id: 'tm', on_date: '2026-05-02' }),
      meal('unset', { trip_id: 'tm', on_date: '2026-05-05' }),
    ]
    const learned = learnedFreshness(meals, [
      ingredient('a', 'old', { trip_id: 't0', name: 'Rahm', fresh: true }),
      ingredient('b', 'new', { trip_id: 'tm', name: 'rahm', fresh: false }),
      ingredient('c', 'unset', { trip_id: 'tm', name: 'Rahm', fresh: null }),
    ])
    expect(learned.get(ingredientKey('Rahm'))).toBe(false)
  })

  it('reads its own setting first, then the learned one, then the built-in list', () => {
    const learned = new Map([[ingredientKey('Rahm'), false]])
    expect(isFresh(ingredient('x', 'm', { name: 'Rahm', fresh: true }), learned)).toBe(true)
    expect(isFresh(ingredient('x', 'm', { name: 'Rahm' }), learned)).toBe(false)
    expect(isFresh(ingredient('x', 'm', { name: 'Milch' }), learned)).toBe(true)
    expect(isFresh(ingredient('x', 'm', { name: 'Reis' }), learned)).toBe(false)
  })
})

describe('ingredientSuggestions (FR-33.12)', () => {
  const meals = [
    meal('feb1', { trip_id: 't0', on_date: '2026-02-08' }),
    meal('feb2', { trip_id: 't0', on_date: '2026-02-09' }),
    meal('mai', { trip_id: 'tm', on_date: '2026-05-02' }),
    meal('now', { trip_id: 't1', on_date: '2026-10-12' }),
  ]
  const ingredients = [
    ingredient('1', 'feb1', { trip_id: 't0', name: 'Butter', amount: '250 g' }),
    ingredient('2', 'feb2', { trip_id: 't0', name: 'butter', amount: '100 g' }),
    ingredient('3', 'mai', { trip_id: 'tm', name: 'Butter', amount: '200 g' }),
    ingredient('4', 'feb1', { trip_id: 't0', name: 'Bündnerfleisch', amount: '80 g' }),
    ingredient('5', 'mai', { trip_id: 'tm', name: 'Bürli', amount: '4' }),
    ingredient('6', 'feb2', { trip_id: 't0', name: 'Bürli', amount: '6' }),
    ingredient('7', 'now', { trip_id: 't1', name: 'Basilikum', amount: '1 Topf' }),
    ingredient('8', 'mai', { trip_id: 'tm', name: 'Müesli', amount: '500 g' }),
  ]
  const suggest = (typed: string, taken: string[] = []) =>
    ingredientSuggestions({ meals, ingredients, trips: TRIPS, typed, taken })

  it('offers the names from the first letter, the most used first, one per name', () => {
    expect(suggest('B').map((s) => s.name)).toEqual([
      'Butter',
      'Bürli',
      'Basilikum',
      'Bündnerfleisch',
    ])
  })

  it('names the amount used last, how often, and the trip it was used last on', () => {
    expect(suggest('Bu')[0]).toMatchObject({
      name: 'Butter',
      amount: '200 g',
      uses: 3,
      tripName: 'Tessin Mai',
      tripStart: '2026-05-01',
    })
  })

  it('matches from the start of the name, umlauts either way (FR-24.7)', () => {
    expect(suggest('Bun').map((s) => s.name)).toEqual(['Bündnerfleisch'])
    expect(suggest('mue').map((s) => s.name)).toEqual(['Müesli'])
    expect(suggest('mu').map((s) => s.name)).toEqual(['Müesli'])
    expect(suggest('tter')).toEqual([])
  })

  it('reads the name behind a typed amount', () => {
    expect(suggest('300 g Bu').map((s) => s.name)).toEqual(['Butter', 'Bürli', 'Bündnerfleisch'])
  })

  it('offers nothing for nothing typed, and never a name the meal already holds', () => {
    expect(suggest('')).toEqual([])
    expect(suggest('  ')).toEqual([])
    expect(suggest('Bu', [' butter']).map((s) => s.name)).toEqual(['Bürli', 'Bündnerfleisch'])
  })

  it('offers at most five', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      ingredient(`k${i}`, 'mai', { trip_id: 'tm', name: `Kraut ${i}` }),
    )
    expect(
      ingredientSuggestions({ meals, ingredients: many, trips: TRIPS, typed: 'k', taken: [] }),
    ).toHaveLength(5)
  })

  it('carries the freshness the name has', () => {
    const learned = [ingredient('f', 'mai', { trip_id: 'tm', name: 'Butter', fresh: true })]
    const out = ingredientSuggestions({
      meals,
      ingredients: [...ingredients, ...learned],
      trips: TRIPS,
      typed: 'Bu',
      taken: [],
    })
    expect(out.find((s) => s.name === 'Butter')?.fresh).toBe(true)
    expect(out.find((s) => s.name === 'Bündnerfleisch')?.fresh).toBe(true)
    expect(out.find((s) => s.name === 'Bürli')?.fresh).toBe(true)
  })
})

describe('sumAmounts (FR-33.14)', () => {
  it.each<[string, (string | null)[], ReturnType<typeof sumAmounts>]>([
    ['grams', ['200 g', '300 g'], [{ value: 500, unit: 'g' }]],
    ['grams into kilos', ['1 kg', '400 g'], [{ value: 1.4, unit: 'kg' }]],
    ['a decimal comma', ['1,5 kg', '500 g'], [{ value: 2, unit: 'kg' }]],
    ['millilitres into decilitres', ['2 dl', '1 dl'], [{ value: 3, unit: 'dl' }]],
    ['into litres', ['5 dl', '1 l'], [{ value: 1.5, unit: 'l' }]],
    ['small volumes stay millilitres', ['20 ml', '3 cl'], [{ value: 50, unit: 'ml' }]],
    ['a bare count and pieces', ['6', '2 Stk.', '1 Stück'], [{ value: 9, unit: '' }]],
    ['a named unit, in its words for many', ['1 Glas', '2 glas'], [{ value: 3, unit: 'Gläser' }]],
    [
      'what does not add up stands side by side',
      ['200 g', '1 Stück', '100 g'],
      [
        { value: 300, unit: 'g' },
        { value: 1, unit: '' },
      ],
    ],
    ['free text as it is', ['etwas', '200 g'], [{ text: 'etwas' }, { value: 200, unit: 'g' }]],
    ['no amount adds nothing', [null, '200 g', ''], [{ value: 200, unit: 'g' }]],
    ['nothing at all', [null, null], []],
  ])('%s', (_label, amounts, expected) => {
    expect(sumAmounts(amounts)).toEqual(expected)
  })
})

describe('sumGroups (FR-33.14)', () => {
  type Part = { id: string; name: string; due: string; fresh: boolean }
  const group = (parts: Part[]) =>
    sumGroups(parts, (p) => ({ key: ingredientKey(p.name), due: p.due, fresh: p.fresh })).map((g) =>
      g.map((p) => p.id),
    )

  it('sums a durable name over the whole trip, in the order the parts came', () => {
    expect(
      group([
        { id: 'a', name: 'Butter', due: '2026-10-12', fresh: false },
        { id: 'b', name: 'Reis', due: '2026-10-13', fresh: false },
        { id: 'c', name: 'butter', due: '2026-10-16', fresh: false },
      ]),
    ).toEqual([['a', 'c'], ['b']])
  })

  it('sums a fresh name only while it is due at most one day after the line’s first', () => {
    expect(
      group([
        { id: 'mo', name: 'Rahm', due: '2026-10-12', fresh: true },
        { id: 'di', name: 'Rahm', due: '2026-10-13', fresh: true },
        { id: 'mi', name: 'Rahm', due: '2026-10-14', fresh: true },
        { id: 'fr', name: 'Rahm', due: '2026-10-16', fresh: true },
      ]),
    ).toEqual([['mo', 'di'], ['mi'], ['fr']])
  })

  it('treats a name as fresh when any of its parts is', () => {
    expect(
      group([
        { id: 'a', name: 'Milch', due: '2026-10-12', fresh: false },
        { id: 'b', name: 'Milch', due: '2026-10-16', fresh: true },
      ]),
    ).toEqual([['a'], ['b']])
  })

  it('orders the lines by their first part', () => {
    expect(
      group([
        { id: 'r1', name: 'Rahm', due: '2026-10-12', fresh: true },
        { id: 'k', name: 'Käse', due: '2026-10-13', fresh: false },
        { id: 'r2', name: 'Rahm', due: '2026-10-15', fresh: true },
      ]),
    ).toEqual([['r1'], ['k'], ['r2']])
  })
})
