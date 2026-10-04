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
import { TABLE } from '@/types/tables'
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
    expect(actions.setBought).toHaveBeenCalledWith(expect.objectContaining({ id: 'i-apple' }), true)
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

describe('the meals on the day plan (FR-33.5)', () => {
  it('stands each meal on its day at its time or its slot’s place, with its share and its cook', () => {
    const { d } = deps()
    const lines = createMealDayPlanSource(d).lines('t1')
    expect(lines.find((l) => l.key === 'meal:dinner')).toMatchObject({
      kind: 'meal',
      from: '2026-10-12',
      time: null,
      placeAt: '18:30',
      timeWord: 'abends',
      label: 'Abendessen',
      assignee: 'u-lena',
      progress: 0.5,
      detail: '1 von 2 Zutaten eingekauft',
    })
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
