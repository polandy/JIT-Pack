/**
 * Making a trip runs on a context alone (R-4) — no orchestrator, no fetch.
 *
 * What is asserted here is the one thing all three cascades exist to get
 * right and that no single-row write can get wrong: the *order*. Every row
 * goes through the same funnel, the master partition's rows precede the ones
 * that reference them by foreign key, and the push happens once at the end
 * for the partitions the cascade actually wrote — the trip-partition rows of
 * a trip the server has not created yet are refused (403/FK), invisibly,
 * because the device that queued them already holds both halves.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createTripCreationActions } from '../actions/tripCreation'
import { makeSeamContext, pullIn, type Recorded, type SeamContext } from './seamContext'
import { TABLE } from '@/types/tables'
import type { GeneratedItem } from '@/domain/instantiate'
import type { ImportPlan } from '@/domain/spreadsheet'

let queued: Recorded[]
let drains: string[][]
let ctx: SeamContext

/** Every write, as (partition, table) in the order the cascade made it. */
const writes = () => queued.flatMap((q) => q.muts.map((m) => [q.type, m.mutation.table] as const))
const tablesOf = (partition: 'trip' | 'master') =>
  writes()
    .filter(([p]) => p === partition)
    .map(([, table]) => table)

function generated(overrides: Partial<GeneratedItem> = {}): GeneratedItem {
  return {
    source_item_id: 'i1',
    source_template_id: 't1',
    name: 'Socken',
    category_name: 'Kleidung',
    weight_grams: 80,
    value_cents: null,
    quantity: 4,
    mode: 'pack',
    late_packer: false,
    traveler_index: null,
    tasks: [],
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued, drains } = makeSeamContext())
})

describe('createTripFromWizard on the seam (FR-2.x)', () => {
  it('queues the master rows a trip row references before the trip itself', () => {
    const actions = createTripCreationActions(ctx)

    const tripId = actions.createTripFromWizard({
      name: 'Engadin',
      year: 2026,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      attributes: null,
      newSeriesName: 'Sommerferien',
      members: [{ userId: 'u2', role: 'editor' }],
      sourceTemplateIds: ['tpl-1'],
      travelers: [{ name: 'Andy' }],
      items: [generated({ traveler_index: 0, tasks: ['Akku laden'] })],
      checklistItems: [{ label: 'Pass prüfen', mode: 'pack' }],
    })

    // The series precedes the trip that names it; membership and the
    // FR-27.4 source follow the trip they are authorized against.
    expect(tablesOf('master')).toEqual([
      TABLE.tripSeries,
      TABLE.trips,
      TABLE.tripMembers,
      TABLE.tripTemplateSources,
    ])
    // The traveler precedes the item assigned to it; the FR-27.7 task
    // follows the row it names, because pushed ahead of it the server
    // rejects the foreign key.
    expect(tablesOf('trip')).toEqual([
      TABLE.travelers,
      TABLE.tripItems,
      TABLE.comments,
      TABLE.tripItems,
    ])
    const tripWrites = queued.filter((q) => q.type === 'trip').flatMap((q) => q.muts)
    const item = tripWrites[1]!.mutation
    expect(tripWrites[2]!.mutation.fields).toMatchObject({
      trip_item_id: item.id,
      is_task: 1,
    })
    expect(queued.every((q) => q.drained === false)).toBe(true)
    expect(drains).toEqual([[tripId]])
  })

  it('assigns the generated item to the traveler its index names', () => {
    const actions = createTripCreationActions(ctx)

    const tripId = actions.createTripFromWizard({
      name: 'Engadin',
      year: 2026,
      startDate: null,
      endDate: null,
      attributes: null,
      travelers: [{ name: 'Andy' }, { name: 'Ronja' }],
      items: [generated({ traveler_index: 1 })],
    })

    const ronja = ctx.tripStore.getTravelers(tripId).find((tr) => tr.name === 'Ronja')!
    expect(ctx.tripStore.getItems(tripId)[0]?.assigned_traveler_id).toBe(ronja.id)
  })
})

describe('cloneTrip on the seam (FR-12)', () => {
  function seedSource(): void {
    pullIn(ctx.tripStore, TABLE.trips, 'src', {
      name: 'Engadin 2025',
      year: 2025,
      status: 'archived',
      series_id: null,
      attributes: null,
    })
    pullIn(ctx.tripStore, TABLE.travelers, 'tr1', { trip_id: 'src', name: 'Andy' })
    pullIn(ctx.tripStore, TABLE.containers, 'c1', { trip_id: 'src', name: 'Rucksack' })
    pullIn(ctx.tripStore, TABLE.tripItems, 'a', {
      trip_id: 'src',
      name: 'Zelt',
      quantity: 1,
      state: 'packed',
      mode: 'pack',
      assigned_traveler_id: 'tr1',
      container_id: 'c1',
    })
  }

  it('queues the trip row, then travelers and containers, then the items that link them', () => {
    seedSource()
    const actions = createTripCreationActions(ctx)

    const tripId = actions.cloneTrip('src', {
      name: 'Engadin 2026',
      year: 2026,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      options: { travelerAssignments: true, packerDelegations: false, containerAssignments: true },
    })!

    expect(tablesOf('master')).toEqual([TABLE.trips])
    expect(tablesOf('trip')).toEqual([TABLE.travelers, TABLE.containers, TABLE.tripItems])
    expect(drains).toEqual([[tripId]])
  })

  it('writes nothing at all when the source rows are not on the device (ADR-033)', () => {
    seedSource()
    const notLoaded = makeSeamContext({ tripDataLoaded: () => false })
    // Same seed, so the refusal cannot be the trip being unknown.
    pullIn(notLoaded.ctx.tripStore, TABLE.trips, 'src', { name: 'Engadin 2025', year: 2025 })

    const result = createTripCreationActions(notLoaded.ctx).cloneTrip('src', {
      name: 'Engadin 2026',
      year: 2026,
      startDate: null,
      endDate: null,
      options: { travelerAssignments: true, packerDelegations: true, containerAssignments: true },
    })

    expect(result).toBeNull()
    expect(notLoaded.queued).toEqual([])
    expect(notLoaded.drains).toEqual([])
  })
})

describe('commitImport on the seam (FR-16.2)', () => {
  const plan: ImportPlan = {
    newCategories: ['Kleidung'],
    items: [{ name: 'Socken', categoryName: 'Kleidung', existingItemId: null, hasOpenTask: true }],
    trips: [
      {
        name: 'Engadin 2023',
        year: 2023,
        endDate: null,
        seriesId: null,
        items: [{ itemIndex: 0, quantity: 5 }],
      },
    ],
  }

  it('queues the tag, then the item, then its assignment, and drains every trip once', () => {
    const actions = createTripCreationActions(ctx)

    const { tripIds } = actions.commitImport(plan)

    expect(tablesOf('master')).toEqual([TABLE.tags, TABLE.items, TABLE.itemTags, TABLE.trips])
    expect(tablesOf('trip')).toEqual([TABLE.tripItems, TABLE.comments])
    expect(drains).toEqual([tripIds])
  })
})
