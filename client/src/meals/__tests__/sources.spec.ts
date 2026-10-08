// @vitest-environment jsdom
/**
 * §3.33: the meal plan's lines on the other screens — its ingredients on the
 * shopping list (FR-33.3), its meals on the day plan (FR-33.5), a picnic on
 * its excursion's list (FR-33.6).
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PullChange } from '@/api/types'
import { setLocale } from '@/i18n'
import { TABLE } from '@/api/tables'
import type { MealActions } from '../actions'
import { useMealSheet } from '../sheet'
import {
  createMealDayPlanSource,
  createMealExcursionSource,
  createMealShoppingSource,
  type MealSourceDeps,
} from '../sources'
import { useMealStore } from '../store'

let seq = 0
function row(table: string, id: string, fields: Record<string, unknown>): PullChange {
  return { seq: ++seq, table, id, deleted: false, row: { trip_id: 't1', ...fields } } as PullChange
}

function deps(today = '2026-10-12') {
  const mealStore = useMealStore()
  const actions = {
    saveMeal: vi.fn(),
    setBought: vi.fn(),
    placeOnShopping: vi.fn(),
    setPacked: vi.fn(),
    moveMeal: vi.fn(),
    removeMeal: vi.fn(),
  } satisfies MealActions
  const d: MealSourceDeps = {
    store: mealStore,
    actions,
    sheet: useMealSheet(),
    context: {
      trips: () => [
        { id: 't1', name: 'Engadin', start_date: '2026-10-10', end_date: '2026-10-17' },
      ],
      excursions: () => [],
      shortlist: () => [],
    },
    today: () => today,
  }
  return { d, mealStore, actions }
}

beforeEach(() => {
  setActivePinia(createPinia())
  setLocale('de')
  const mealStore = useMealStore()
  mealStore.applyChanges([
    row(TABLE.meals, 'past', {
      on_date: '2026-10-11',
      slot: 'dinner',
      title: 'Älplermagronen',
      kind: 'cook',
    }),
    row(TABLE.meals, 'dinner', {
      on_date: '2026-10-12',
      slot: 'dinner',
      title: 'Raclette',
      kind: 'cook',
      cook_user_id: 'u-lena',
    }),
    row(TABLE.meals, 'lunch', {
      on_date: '2026-10-12',
      slot: 'lunch',
      title: 'Picknick',
      kind: 'cook',
      at_time: '12:15',
      excursion_id: 'ex-1',
    }),
    row(TABLE.meals, 'out', {
      on_date: '2026-10-13',
      slot: 'lunch',
      title: 'Alp Grüm',
      kind: 'out',
      place: 'Ristorante',
    }),
    row(TABLE.mealIngredients, 'i-past', { meal_id: 'past', name: 'Hörnli', list: 'buy_local' }),
    row(TABLE.mealIngredients, 'i-pot', {
      meal_id: 'dinner',
      name: 'Kartoffeln',
      amount: '1 kg',
      list: 'buy_local',
      position: 1,
    }),
    row(TABLE.mealIngredients, 'i-cheese', {
      meal_id: 'dinner',
      name: 'Raclettekäse',
      list: 'buy_before',
      position: 0,
      bought: 1,
    }),
    row(TABLE.mealIngredients, 'i-apple', {
      meal_id: 'lunch',
      name: 'Äpfel',
      list: 'buy_local',
      position: 0,
    }),
  ])
})

describe('the ingredients on the shopping list (FR-33.3)', () => {
  it('lists the open ones of meals not yet eaten, in the order of their meals, under one heading', () => {
    const { d } = deps()
    const open = createMealShoppingSource(d).open('t1', 'buy_local')
    expect(open.map((l) => l.name)).toEqual(['Äpfel', 'Kartoffeln'])
    expect(open[1]).toMatchObject({
      key: 'meal:i-pot',
      section: 'Essensplan',
      sectionRank: 1,
      // The weekday is the platform's short form — „Mo.“ in a browser, „Mo“ in some ICU builds.
      detail: expect.stringMatching(/^1 kg · Mo\.? Abend · Raclette$/),
      dueDate: '2026-10-12',
      pressingDays: 0,
    })
  })

  it('keeps a bought one under its list’s bought fold, and buys through the module', () => {
    const { d, actions } = deps()
    const source = createMealShoppingSource(d)
    expect(source.bought('t1', 'buy_before').map((l) => l.name)).toEqual(['Raclettekäse'])
    source.open('t1', 'buy_local')[0]!.buy()
    expect(actions.setBought).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'i-apple' })],
      true,
    )
  })

  it('makes an ingredient bought before the trip due on the eve of departure', () => {
    const { d, mealStore } = deps('2026-10-05')
    mealStore.applyChanges([
      row(TABLE.mealIngredients, 'i-cheese', {
        meal_id: 'dinner',
        name: 'Raclettekäse',
        list: 'buy_before',
      }),
    ])
    expect(createMealShoppingSource(d).open('t1', 'buy_before')[0]?.dueDate).toBe('2026-10-09')
  })
})

describe('one name summed into one line (FR-33.13/33.14)', () => {
  /** Two more dinners: butter on the 12th, 13th and 16th; cream on the 12th, 13th and 16th. */
  function withWeek() {
    const { d, mealStore, actions } = deps()
    mealStore.applyChanges([
      row(TABLE.meals, 'tue', {
        on_date: '2026-10-13',
        slot: 'breakfast',
        title: 'Zmorge',
        kind: 'cook',
      }),
      row(TABLE.meals, 'fri', {
        on_date: '2026-10-16',
        slot: 'dinner',
        title: 'Älplermagronen',
        kind: 'cook',
      }),
      row(TABLE.mealIngredients, 'b-mo', {
        meal_id: 'dinner',
        name: 'Butter',
        amount: '200 g',
        position: 2,
      }),
      row(TABLE.mealIngredients, 'b-di', {
        meal_id: 'tue',
        name: 'butter',
        amount: '300 g',
        position: 0,
      }),
      row(TABLE.mealIngredients, 'b-fr', {
        meal_id: 'fri',
        name: 'Butter',
        amount: '1 kg',
        position: 0,
      }),
      row(TABLE.mealIngredients, 'r-mo', {
        meal_id: 'dinner',
        name: 'Rahm',
        amount: '2 dl',
        position: 3,
      }),
      row(TABLE.mealIngredients, 'r-di', {
        meal_id: 'tue',
        name: 'Rahm',
        amount: '1 dl',
        position: 1,
      }),
      row(TABLE.mealIngredients, 'r-fr', {
        meal_id: 'fri',
        name: 'Rahm',
        amount: '2 dl',
        position: 1,
      }),
    ])
    return { d, actions, open: createMealShoppingSource(d).open('t1', 'buy_local') }
  }

  it('sums durable food over the trip, due at its first meal, its parts on the second line', () => {
    const { open } = withWeek()
    const butter = open.filter((l) => l.name === 'Butter')
    expect(butter).toHaveLength(1)
    expect(butter[0]).toMatchObject({
      key: 'meal:b-mo',
      total: '1.5 kg',
      fresh: false,
      dueDate: '2026-10-12',
      detail: expect.stringMatching(/^Mo\.? Abend 200 g · Di\.? Morgen 300 g · Fr\.? Abend 1 kg$/),
    })
    expect(butter[0]!.parts!.map((p) => p.amount)).toEqual(['200 g', '300 g', '1 kg'])
    expect(butter[0]!.parts![2]!.label).toMatch(/^Fr\.? Abend · Älplermagronen$/)
  })

  it('sums fresh food only across one day — Friday’s cream is a line of its own', () => {
    const { open } = withWeek()
    const cream = open.filter((l) => l.name === 'Rahm')
    expect(cream.map((l) => [l.total ?? null, l.dueDate, l.fresh])).toEqual([
      ['3 dl', '2026-10-12', true],
      [null, '2026-10-16', true],
    ])
    expect(cream[1]!.parts).toBeUndefined()
  })

  it('buys, puts back and places every part of a summed line', () => {
    const { open, actions } = withWeek()
    const butter = open.find((l) => l.name === 'Butter')!
    const ids = ['b-mo', 'b-di', 'b-fr'].map((id) => expect.objectContaining({ id }))
    butter.buy()
    expect(actions.setBought).toHaveBeenLastCalledWith(ids, true)
    butter.unbuy()
    expect(actions.setBought).toHaveBeenLastCalledWith(ids, false)
    butter.place(4)
    expect(actions.placeOnShopping).toHaveBeenLastCalledWith(ids, 4)
  })

  it('shows the rest once a part is bought in its meal, and a durable name set fresh splits', () => {
    const { d, mealStore } = deps()
    mealStore.applyChanges([
      row(TABLE.meals, 'fri', {
        on_date: '2026-10-16',
        slot: 'dinner',
        title: 'Rösti',
        kind: 'cook',
      }),
      row(TABLE.mealIngredients, 'b-mo', { meal_id: 'dinner', name: 'Butter', amount: '200 g' }),
      row(TABLE.mealIngredients, 'b-fr', {
        meal_id: 'fri',
        name: 'Butter',
        amount: '100 g',
        bought: 1,
      }),
    ])
    const source = createMealShoppingSource(d)
    const rest = source.open('t1', 'buy_local').find((l) => l.name === 'Butter')!
    expect(rest.key).toBe('meal:b-mo')
    expect(rest.parts).toBeUndefined()
    // Friday's butter back on the list, set fresh: the name is fresh now, and four days apart.
    mealStore.applyChanges([
      row(TABLE.mealIngredients, 'b-fr', {
        meal_id: 'fri',
        name: 'Butter',
        amount: '100 g',
        fresh: 1,
      }),
    ])
    expect(source.open('t1', 'buy_local').filter((l) => l.name === 'Butter')).toHaveLength(2)
  })
})

describe('the meals on the day plan (FR-33.5)', () => {
  it('stands each meal on its day at its time or its slot’s place, with its share and its cook', () => {
    const { d } = deps()
    const lines = createMealDayPlanSource(d).lines('t1')
    expect(lines.find((l) => l.key === 'meal:dinner')).toMatchObject({
      kind: 'meal',
      from: '2026-10-12',
      time: null,
      placeAt: '18:30',
      timeWord: 'Abend',
      assignee: 'u-lena',
      progress: 0.5,
      progressName: '1 von 2 Zutaten',
      detail: '1 von 2 Zutaten eingekauft',
    })
    // UX-10: the slot is said once, in M31's and M1's short noun; the label over the title is the kind's.
    expect(lines.find((l) => l.key === 'meal:dinner')).not.toHaveProperty('label')
    expect(lines.find((l) => l.key === 'meal:out')).toMatchObject({
      progress: null,
      detail: 'auswärts · Ristorante',
    })
  })

  it('opens the meal’s sheet over the plan', () => {
    const { d } = deps()
    createMealDayPlanSource(d)
      .lines('t1')
      .find((l) => l.key === 'meal:lunch')!.open!()
    expect(useMealSheet().request).toEqual({ tripId: 't1', mealId: 'lunch' })
  })
})

describe('a picnic on its excursion’s list (FR-33.6)', () => {
  it('is one line of the excursion it is taken on, packed through the module', () => {
    const { d, actions } = deps()
    const source = createMealExcursionSource(d)
    expect(source.lines('t1', 'ex-2')).toEqual([])
    const [picnic] = source.lines('t1', 'ex-1')
    expect(picnic).toMatchObject({
      key: 'meal:lunch',
      title: 'Picknick',
      group: 'Essen',
      packed: false,
    })
    picnic!.toggle()
    expect(actions.setPacked).toHaveBeenCalledWith(expect.objectContaining({ id: 'lunch' }), true)
  })
})
