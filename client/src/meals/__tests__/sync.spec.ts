/**
 * The meal plan through the real orchestrator (§3.33, FR-33.10): the pull
 * funnel, a meal written with its ingredients, an edit written field by
 * field, a purchase, and a meal's delete taking its ingredients along.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { installHarness, type Harness } from '@/__tests__/harness'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { TABLE } from '@/api/tables'
import { createMealActions, type DraftIngredient, type MealFields } from '../actions'
import { mealFeatureStore, useMealStore } from '../store'

let harness: Harness

beforeEach(() => {
  harness = installHarness()
  globalThis.indexedDB = new IDBFactory()
})

function serverOrch() {
  return useSyncOrchestrator({
    baseUrl: 'http://localhost',
    getToken: () => null,
    features: [mealFeatureStore()],
  })
}

const RACLETTE: MealFields = {
  day: '2026-10-12',
  slot: 'dinner',
  title: ' Raclette ',
  kind: 'cook',
  time: null,
  note: null,
  place: null,
  cookUserId: 'user-lena',
  excursionId: null,
}

const draft = (name: string, amount: string | null = null): DraftIngredient => ({
  id: null,
  name,
  amount,
  list: 'buy_local',
  bought: false,
  fresh: null,
})

describe('the meal plan through the orchestrator (§3.33)', () => {
  it('routes a pulled meal and its ingredient to the meal store', async () => {
    const orch = serverOrch()
    harness.mockPull([
      {
        seq: 1,
        table: TABLE.meals,
        id: 'meal-1',
        deleted: false,
        row: {
          trip_id: 't1',
          on_date: '2026-10-12',
          slot: 'lunch',
          title: 'Picknick',
          kind: 'cook',
        },
      },
      {
        seq: 2,
        table: TABLE.mealIngredients,
        id: 'ing-1',
        deleted: false,
        row: { trip_id: 't1', meal_id: 'meal-1', name: 'Bürli', list: 'buy_local', bought: 1 },
      },
    ])
    await orch.drainTrip('t1')
    expect(useMealStore().getMeals('t1')).toMatchObject([{ id: 'meal-1', slot: 'lunch' }])
    expect(useMealStore().ingredientsOf('meal-1')).toMatchObject([{ name: 'Bürli', bought: true }])
  })

  it('writes a new meal and its ingredients in their order (FR-33.1/33.2)', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const actions = createMealActions(orch.moduleHost, useMealStore())
    actions.saveMeal('t1', null, RACLETTE, [draft('Kartoffeln', '1 kg'), draft('Essiggurken')])
    await orch.drainTrip('t1')

    const pushed = harness.pushedMutations()
    expect(pushed[0]).toMatchObject({
      op: 'insert',
      table: TABLE.meals,
      fields: { trip_id: 't1', title: 'Raclette', slot: 'dinner', cook_user_id: 'user-lena' },
    })
    expect(
      pushed.slice(1).map((m) => [m.table, m.fields?.['name'], m.fields?.['position']]),
    ).toEqual([
      [TABLE.mealIngredients, 'Kartoffeln', 0],
      [TABLE.mealIngredients, 'Essiggurken', 1],
    ])
  })

  it('writes an edit field by field, and only the ingredients that changed', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const mealStore = useMealStore()
    const actions = createMealActions(orch.moduleHost, mealStore)
    const id = actions.saveMeal('t1', null, RACLETTE, [draft('Kartoffeln'), draft('Essiggurken')])!
    await orch.drainTrip('t1')
    const [potatoes, pickles] = mealStore
      .ingredientsOf(id)
      .sort((a, b) => a.position! - b.position!)

    actions.saveMeal('t1', mealStore.getMeal(id)!, { ...RACLETTE, time: '19:00' }, [
      {
        id: potatoes!.id,
        name: 'Kartoffeln',
        amount: '1 kg',
        list: 'buy_local',
        bought: false,
        fresh: null,
      },
      draft('Silberzwiebeln'),
    ])
    await orch.drainTrip('t1')

    const edit = harness.pushedMutations().slice(3, 7)
    expect(edit).toMatchObject([
      { op: 'upsert', table: TABLE.meals, fields: { at_time: '19:00' } },
      { op: 'upsert', table: TABLE.mealIngredients, id: potatoes!.id, fields: { amount: '1 kg' } },
      {
        op: 'insert',
        table: TABLE.mealIngredients,
        fields: { name: 'Silberzwiebeln', position: 1 },
      },
      { op: 'delete', table: TABLE.mealIngredients, id: pickles!.id },
    ])
    expect(Object.keys(edit[0]!.fields ?? {})).toEqual(['at_time'])
  })

  it('writes an ingredient’s freshness when it is set, and only the column that changed (FR-33.13)', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const mealStore = useMealStore()
    const actions = createMealActions(orch.moduleHost, mealStore)
    const id = actions.saveMeal('t1', null, RACLETTE, [{ ...draft('Rahm', '2 dl'), fresh: true }])!
    await orch.drainTrip('t1')
    const [cream] = mealStore.ingredientsOf(id)
    expect(cream!.fresh).toBe(true)
    expect(harness.pushedMutations()[1]).toMatchObject({ fields: { name: 'Rahm', fresh: 1 } })

    actions.saveMeal('t1', mealStore.getMeal(id)!, RACLETTE, [
      {
        id: cream!.id,
        name: 'Rahm',
        amount: '2 dl',
        list: 'buy_local',
        bought: false,
        fresh: false,
      },
    ])
    await orch.drainTrip('t1')
    const set = harness.pushedMutations()[2]!
    expect(set).toMatchObject({ op: 'upsert', id: cream!.id, fields: { fresh: 0 } })
    expect(Object.keys(set.fields ?? {})).toEqual(['fresh'])
    expect(mealStore.ingredientsOf(id)[0]!.fresh).toBe(false)
  })

  it('drops the ingredients of a meal turned into one eaten out', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const mealStore = useMealStore()
    const actions = createMealActions(orch.moduleHost, mealStore)
    const id = actions.saveMeal('t1', null, RACLETTE, [draft('Kartoffeln')])!
    actions.saveMeal(
      't1',
      mealStore.getMeal(id)!,
      { ...RACLETTE, kind: 'out', place: 'Pizzeria Mulin' },
      [draft('Kartoffeln')],
    )
    expect(mealStore.ingredientsOf(id)).toEqual([])
    expect(mealStore.getMeal(id)).toMatchObject({
      kind: 'out',
      place: 'Pizzeria Mulin',
      cook_user_id: null,
    })
  })

  it('names a meal eaten out without a dish by its place, and writes nothing for neither', () => {
    const orch = serverOrch()
    const mealStore = useMealStore()
    const actions = createMealActions(orch.moduleHost, mealStore)
    const out = {
      ...RACLETTE,
      title: '',
      kind: 'out' as const,
      place: 'Pizzeria Mulin, Pontresina',
    }
    expect(mealStore.getMeal(actions.saveMeal('t1', null, out, [])!)?.title).toBe('Pizzeria Mulin')
    expect(actions.saveMeal('t1', null, { ...RACLETTE, title: '  ' }, [])).toBeNull()
  })

  it('stamps a purchase with the tap’s time and clears it when taken back (FR-33.3)', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const mealStore = useMealStore()
    const actions = createMealActions(orch.moduleHost, mealStore)
    const id = actions.saveMeal('t1', null, RACLETTE, [draft('Kartoffeln')])!
    const potatoes = mealStore.ingredientsOf(id)[0]!
    actions.setBought([potatoes], true)
    expect(mealStore.ingredientsOf(id)[0]).toMatchObject({ bought: true })
    expect(mealStore.ingredientsOf(id)[0]!.bought_at).not.toBeNull()
    actions.setBought([mealStore.ingredientsOf(id)[0]!], false)
    expect(mealStore.ingredientsOf(id)[0]).toMatchObject({ bought: false, bought_at: null })
  })

  it('takes a picnic off its excursion’s rucksack when it leaves the excursion (FR-33.6)', () => {
    const orch = serverOrch()
    const mealStore = useMealStore()
    const actions = createMealActions(orch.moduleHost, mealStore)
    const lunch = { ...RACLETTE, slot: 'lunch' as const, excursionId: 'ex-1' }
    const id = actions.saveMeal('t1', null, lunch, [])!
    actions.setPacked(mealStore.getMeal(id)!, true)
    expect(mealStore.getMeal(id)!.excursion_packed_at).not.toBeNull()
    actions.saveMeal(
      't1',
      mealStore.getMeal(id)!,
      { ...lunch, slot: 'dinner', excursionId: null },
      [],
    )
    expect(mealStore.getMeal(id)).toMatchObject({ excursion_id: null, excursion_packed_at: null })
  })

  it('writes a move as its day alone, and its undo puts the day back (FR-33.15)', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const mealStore = useMealStore()
    const actions = createMealActions(orch.moduleHost, mealStore)
    const id = actions.saveMeal('t1', null, RACLETTE, [draft('Kartoffeln')])!
    await orch.drainTrip('t1')

    const undo = actions.moveMeal(mealStore.getMeal(id)!, {
      on_date: '2026-10-15',
      slot: 'dinner',
      at_time: null,
      excursion_id: null,
    })
    expect(mealStore.getMeal(id)).toMatchObject({ on_date: '2026-10-15', slot: 'dinner' })
    await orch.drainTrip('t1')
    const move = harness.pushedMutations().at(-1)!
    expect(move).toMatchObject({ op: 'upsert', table: TABLE.meals, id })
    expect(Object.keys(move.fields ?? {})).toEqual(['on_date'])

    undo()
    expect(mealStore.getMeal(id)!.on_date).toBe('2026-10-12')
  })

  it('takes a packed picnic out of the rucksack when a move changes its excursion, and the undo packs it again (FR-33.15)', () => {
    const orch = serverOrch()
    const mealStore = useMealStore()
    const actions = createMealActions(orch.moduleHost, mealStore)
    const lunch = { ...RACLETTE, slot: 'lunch' as const, excursionId: 'ex-1' }
    const id = actions.saveMeal('t1', null, lunch, [])!
    actions.setPacked(mealStore.getMeal(id)!, true)
    const packedAt = mealStore.getMeal(id)!.excursion_packed_at

    const undo = actions.moveMeal(mealStore.getMeal(id)!, {
      on_date: '2026-10-13',
      slot: 'lunch',
      at_time: null,
      excursion_id: null,
    })
    expect(mealStore.getMeal(id)).toMatchObject({
      on_date: '2026-10-13',
      excursion_id: null,
      excursion_packed_at: null,
    })
    undo()
    expect(mealStore.getMeal(id)).toMatchObject({
      on_date: '2026-10-12',
      excursion_id: 'ex-1',
      excursion_packed_at: packedAt,
    })
  })

  it('writes a move into another slot as its slot and its dropped time, and the undo brings both back (FR-33.15)', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const mealStore = useMealStore()
    const actions = createMealActions(orch.moduleHost, mealStore)
    const id = actions.saveMeal('t1', null, { ...RACLETTE, time: '19:00' }, [])!
    await orch.drainTrip('t1')

    const undo = actions.moveMeal(mealStore.getMeal(id)!, {
      on_date: '2026-10-12',
      slot: 'lunch',
      at_time: null,
      excursion_id: null,
    })
    expect(mealStore.getMeal(id)).toMatchObject({ slot: 'lunch', at_time: null })
    await orch.drainTrip('t1')
    const move = harness.pushedMutations().at(-1)!
    expect(Object.keys(move.fields ?? {}).sort()).toEqual(['at_time', 'slot'])

    undo()
    expect(mealStore.getMeal(id)).toMatchObject({ slot: 'dinner', at_time: '19:00' })
  })

  it('deletes a meal with every ingredient, bought or not (FR-33.9)', () => {
    const orch = serverOrch()
    const mealStore = useMealStore()
    const actions = createMealActions(orch.moduleHost, mealStore)
    const id = actions.saveMeal('t1', null, RACLETTE, [
      draft('Kartoffeln'),
      { ...draft('Käse'), bought: true },
    ])!
    actions.removeMeal(mealStore.getMeal(id)!)
    expect(mealStore.getMeal(id)).toBeUndefined()
    expect(mealStore.getIngredients('t1')).toEqual([])
  })
})
