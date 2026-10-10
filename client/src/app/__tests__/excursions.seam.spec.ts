/**
 * FR-31 — the excursion actions against the real stores, with a recording
 * queue: what creating one from a Gruppe writes into the suitcase and what it
 * leaves alone once the suitcase is closed, what a change of participants does
 * to the list, that each undo takes back its own act, and what saving the
 * list as a Gruppe writes.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createExcursionActions } from '../actions/excursions'
import { createMasterDataActions } from '../actions/masterData'
import { createTripLifecycleActions } from '../actions/tripLifecycle'
import { createCommentActions } from '../actions/comments'
import { createPackingActions } from '../actions/packing'
import { createGroupRefreshActions } from '../actions/groupRefresh'
import { changesOf, makeSeamContext, pullIn, type Recorded, type SeamContext } from './seamContext'
import { TABLE } from '@/api/tables'
import { ref } from 'vue'
import { keyedSink } from '@/sync/bucketedRows'
import { specifiedSinks } from '@/sync/sinks'
import { PLANNER_ROWS } from '@/planner/rows'

/** No track is uploaded here — `excursionTracks.seam.spec.ts` drives those. */
const noTrackFiles = {
  add: () => Promise.resolve(),
  replace: () => Promise.resolve(),
  file: () => Promise.resolve(null),
  forget: () => Promise.resolve(),
}

const TRIP_ID = 'trip-1'
const GROUP_ID = 'grp-hut'

let ctx: SeamContext
let queued: Recorded[]

function build(c: SeamContext = ctx) {
  return createExcursionActions(c, { groups: createMasterDataActions(c), tracks: noTrackFiles })
}

/** A trip that has not started — the seam clock is 2026-06-01. */
function seedTrip(fields: Record<string, unknown> = {}) {
  pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, {
    name: 'Sardinien',
    year: 2026,
    status: 'planning',
    start_date: '2026-07-10',
    end_date: '2026-07-24',
    ...fields,
  })
  for (const [id, name] of [
    ['tr-andy', 'Andy'],
    ['tr-sia', 'Sia'],
  ]) {
    pullIn(ctx.tripStore, TABLE.travelers, id!, { trip_id: TRIP_ID, name })
  }
}

/** The hut group: a sleeping bag each, one headlamp, lunch on the spot. */
function seedGroup() {
  pullIn(ctx.masterStore, TABLE.templates, GROUP_ID, {
    name: 'Hüttenübernachtung',
    kind: 'group',
    owner_id: 'u1',
  })
  const items: Array<[string, string]> = [
    ['item-bag', 'Hüttenschlafsack'],
    ['item-lamp', 'Stirnlampe'],
    ['item-food', 'Proviant'],
  ]
  for (const [id, name] of items) pullIn(ctx.masterStore, TABLE.items, id, { name })
  const positions: Array<[string, string, Record<string, unknown>]> = [
    ['pos-bag', 'item-bag', { assignment: 'per_person' }],
    ['pos-lamp', 'item-lamp', { assignment: 'trip_global' }],
    ['pos-food', 'item-food', { assignment: 'trip_global', default_mode: 'buy_local' }],
  ]
  for (const [id, itemId, extra] of positions) {
    pullIn(ctx.masterStore, TABLE.templateItems, id, {
      template_id: GROUP_ID,
      item_id: itemId,
      quantity: 1,
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
      ...extra,
    })
  }
}

function lines() {
  return ctx.tripStore.getExcursionItems(TRIP_ID)
}

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

describe('createExcursion — FR-31.2, FR-31.4', () => {
  it('writes the Gruppe as lines for the participants and puts what the suitcase lacks into it', () => {
    seedTrip()
    seedGroup()
    pullIn(ctx.tripStore, TABLE.tripItems, 'ti-lamp', {
      trip_id: TRIP_ID,
      name: 'Stirnlampe',
      source_item_id: 'item-lamp',
      quantity: 1,
    })

    const report = build().createExcursion(TRIP_ID, {
      name: 'Hüttentour',
      startsOn: '2026-07-17',
      endsOn: '2026-07-16',
      travelerIds: null,
      templateId: GROUP_ID,
    })!

    const excursion = ctx.tripStore.getExcursions(TRIP_ID)[0]!
    // A reversed pair is written in order.
    expect([excursion.name, excursion.starts_on, excursion.ends_on]).toEqual([
      'Hüttentour',
      '2026-07-16',
      '2026-07-17',
    ])
    expect(report).toMatchObject({ lines: 4, addedToSuitcase: 2, notInLuggage: 0 })

    const bags = lines().filter((l) => l.name === 'Hüttenschlafsack')
    expect(bags.map((l) => l.assigned_traveler_id)).toEqual(['tr-andy', 'tr-sia'])
    // Each sleeping bag is Andy's or Sia's own suitcase row, created for them.
    const suitcase = ctx.tripStore.getItems(TRIP_ID)
    for (const bag of bags) {
      const row = suitcase.find((t) => t.id === bag.trip_item_id)!
      expect(row.assigned_traveler_id).toBe(bag.assigned_traveler_id)
    }
    expect(lines().find((l) => l.name === 'Stirnlampe')!.trip_item_id).toBe('ti-lamp')
    // Lunch is bought at the trailhead: no suitcase row, no link.
    expect(lines().find((l) => l.name === 'Proviant')).toMatchObject({
      mode: 'buy_local',
      trip_item_id: null,
    })
    expect(suitcase.some((t) => t.name === 'Proviant')).toBe(false)
  })

  it('writes nothing into a suitcase that is closed and marks what is not in it', () => {
    seedTrip({ packing_closed_at: '2026-05-30T20:00:00Z' })
    seedGroup()
    const before = ctx.tripStore.getItems(TRIP_ID).length

    const report = build().createExcursion(TRIP_ID, {
      name: 'Hüttentour',
      startsOn: null,
      endsOn: null,
      travelerIds: ['tr-sia'],
      templateId: GROUP_ID,
    })!

    expect(ctx.tripStore.getItems(TRIP_ID)).toHaveLength(before)
    expect(queued.flatMap((q) => q.muts).some((m) => m.mutation.table === TABLE.tripItems)).toBe(
      false,
    )
    // Sia goes alone: one sleeping bag, and it and the lamp are not in the luggage.
    expect(report.notInLuggage).toBe(2)
    expect(
      lines()
        .filter((l) => l.not_in_luggage)
        .map((l) => [l.name, l.assigned_traveler_id]),
    ).toEqual([
      ['Hüttenschlafsack', 'tr-sia'],
      ['Stirnlampe', null],
    ])
  })

  it('refuses a trip whose rows are not on the device, rather than duplicating its suitcase', () => {
    ;({ ctx, queued } = makeSeamContext({ tripDataLoaded: () => false }))
    seedTrip()
    expect(
      build().createExcursion(TRIP_ID, {
        name: 'x',
        startsOn: null,
        endsOn: null,
        travelerIds: null,
        templateId: null,
      }),
    ).toBeNull()
    expect(queued).toEqual([])
  })

  it('undoes the whole act: the excursion, its lines, and what it put into the suitcase', () => {
    seedTrip()
    seedGroup()
    pullIn(ctx.tripStore, TABLE.tripItems, 'ti-lamp', {
      trip_id: TRIP_ID,
      name: 'Stirnlampe',
      source_item_id: 'item-lamp',
      quantity: 1,
    })
    const report = build().createExcursion(TRIP_ID, {
      name: 'Hüttentour',
      startsOn: null,
      endsOn: null,
      travelerIds: null,
      templateId: GROUP_ID,
    })!

    report.undo()

    expect(ctx.tripStore.getExcursions(TRIP_ID)).toEqual([])
    expect(lines()).toEqual([])
    expect(ctx.tripStore.getItems(TRIP_ID).map((t) => t.id)).toEqual(['ti-lamp'])
  })
})

describe('setParticipants — FR-31.5', () => {
  it('grows a für-alle set for a joiner, drops a leaver’s open lines, keeps their packed ones, and undoes it', () => {
    seedTrip()
    seedGroup()
    pullIn(ctx.tripStore, TABLE.travelers, 'tr-lio', { trip_id: TRIP_ID, name: 'Lio' })
    const actions = build()
    const { excursionId } = actions.createExcursion(TRIP_ID, {
      name: 'Hüttentour',
      startsOn: null,
      endsOn: null,
      travelerIds: ['tr-andy', 'tr-sia'],
      templateId: GROUP_ID,
    })!
    const siasBag = lines().find((l) => l.assigned_traveler_id === 'tr-sia')!
    actions.setLineCount(siasBag, 1)
    pullIn(ctx.tripStore, TABLE.excursionItems, 'l-book', {
      trip_id: TRIP_ID,
      excursion_id: excursionId,
      name: 'Buch',
      assigned_traveler_id: 'tr-sia',
    })

    const undo = actions.setParticipants(TRIP_ID, excursionId, ['tr-andy', 'tr-lio'])

    const bagsFor = lines()
      .filter((l) => l.name === 'Hüttenschlafsack')
      .map((l) => l.assigned_traveler_id)
      .sort()
    expect(bagsFor).toEqual(['tr-andy', 'tr-lio', 'tr-sia'])
    expect(lines().some((l) => l.id === 'l-book')).toBe(false)

    undo()

    expect(
      ctx.tripStore
        .getExcursionTravelers(TRIP_ID)
        .map((r) => r.traveler_id)
        .sort(),
    ).toEqual(['tr-andy', 'tr-sia'])
    expect(lines().some((l) => l.assigned_traveler_id === 'tr-lio')).toBe(false)
    expect(lines().some((l) => l.id === 'l-book')).toBe(true)
  })
})

describe('the line’s own acts — FR-31.6, FR-31.8', () => {
  it('ticks, skips and buys on the spot on the line alone, never on its suitcase row', () => {
    seedTrip()
    seedGroup()
    const actions = build()
    actions.createExcursion(TRIP_ID, {
      name: 'H',
      startsOn: null,
      endsOn: null,
      travelerIds: null,
      templateId: GROUP_ID,
    })
    const lamp = lines().find((l) => l.name === 'Stirnlampe')!
    const suitcaseBefore = ctx.tripStore.getItems(TRIP_ID).find((t) => t.id === lamp.trip_item_id)!

    actions.toggleLine(lamp)
    expect(lines().find((l) => l.id === lamp.id)).toMatchObject({
      packed_count: 1,
      state: 'packed',
    })
    expect(ctx.tripStore.getItems(TRIP_ID).find((t) => t.id === lamp.trip_item_id)).toEqual(
      suitcaseBefore,
    )

    const food = lines().find((l) => l.name === 'Proviant')!
    actions.markBought(food, true)
    expect(lines().find((l) => l.id === food.id)!.bought_at).not.toBeNull()

    actions.skipLine(lines().find((l) => l.id === lamp.id)!)
    expect(lines().find((l) => l.id === lamp.id)).toMatchObject({ quantity: 0, state: 'skipped' })
  })
})

describe('deleting — FR-31.1, FR-31.5', () => {
  it('takes the excursion’s participants and lines with it, and leaves the suitcase', () => {
    seedTrip()
    seedGroup()
    const actions = build()
    const { excursionId } = actions.createExcursion(TRIP_ID, {
      name: 'H',
      startsOn: null,
      endsOn: null,
      travelerIds: ['tr-sia'],
      templateId: GROUP_ID,
    })!
    const suitcase = ctx.tripStore.getItems(TRIP_ID).length

    actions.deleteExcursion(TRIP_ID, excursionId)

    expect(lines()).toEqual([])
    expect(ctx.tripStore.getExcursionTravelers(TRIP_ID)).toEqual([])
    expect(ctx.tripStore.getItems(TRIP_ID)).toHaveLength(suitcase)
  })

  it('takes a traveller off its excursions when they are taken off the trip', () => {
    seedTrip()
    seedGroup()
    const excursions = build()
    excursions.createExcursion(TRIP_ID, {
      name: 'H',
      startsOn: null,
      endsOn: null,
      travelerIds: ['tr-sia'],
      templateId: GROUP_ID,
    })
    const comments = createCommentActions(ctx)
    const lifecycle = createTripLifecycleActions(ctx, {
      comments,
      packing: createPackingActions(ctx),
      groupRefresh: createGroupRefreshActions(ctx, { comments }),
    })

    lifecycle.removeTraveler(TRIP_ID, 'tr-sia')

    expect(ctx.tripStore.getExcursionTravelers(TRIP_ID)).toEqual([])
    expect(lines().some((l) => l.assigned_traveler_id === 'tr-sia')).toBe(false)
  })

  it('takes a traveller off a feature module’s rows too, in the same write (FR-29.15)', () => {
    seedTrip()
    ctx.features = [
      {
        sinks: specifiedSinks(PLANNER_ROWS, {
          [TABLE.dayEntryTravelers]: keyedSink(
            ref(
              new Map([
                [
                  'det-sia',
                  { id: 'det-sia', trip_id: TRIP_ID, day_entry_id: 'de-1', traveler_id: 'tr-sia' },
                ],
              ]),
            ),
          ),
        }),
      },
    ]
    const comments = createCommentActions(ctx)
    const lifecycle = createTripLifecycleActions(ctx, {
      comments,
      packing: createPackingActions(ctx),
      groupRefresh: createGroupRefreshActions(ctx, { comments }),
    })

    lifecycle.removeTraveler(TRIP_ID, 'tr-sia')

    const removal = queued
      .flatMap((q) => q.muts)
      .find((m) => m.mutation.table === TABLE.travelers && m.mutation.op === 'delete')!
    expect(changesOf(removal)).toContainEqual(
      expect.objectContaining({ table: TABLE.dayEntryTravelers, id: 'det-sia', deleted: true }),
    )
  })
})

describe('saveAsGroup — FR-31.11', () => {
  it('writes a Gruppe whose positions fold the list back, creating only the items the inventory lacks', () => {
    seedTrip()
    seedGroup()
    const actions = build()
    const { excursionId } = actions.createExcursion(TRIP_ID, {
      name: 'H',
      startsOn: null,
      endsOn: null,
      travelerIds: null,
      templateId: GROUP_ID,
    })!
    pullIn(ctx.tripStore, TABLE.excursionItems, 'l-cards', {
      trip_id: TRIP_ID,
      excursion_id: excursionId,
      name: 'Kartenspiel',
    })

    const groupId = actions.saveAsGroup(TRIP_ID, excursionId, 'Hütte mit Kindern')!

    expect(ctx.masterStore.getTemplate(groupId)).toMatchObject({
      name: 'Hütte mit Kindern',
      kind: 'group',
    })
    const positions = ctx.masterStore.getTemplateItems(groupId)
    const byItem = new Map(positions.map((p) => [ctx.masterStore.getItem(p.item_id)!.name, p]))
    expect([...byItem.keys()].sort()).toEqual([
      'Hüttenschlafsack',
      'Kartenspiel',
      'Proviant',
      'Stirnlampe',
    ])
    expect(byItem.get('Hüttenschlafsack')!.assignment).toBe('per_person')
    expect(byItem.get('Proviant')!.default_mode).toBe('buy_local')
  })

  it('names what the inventory lacks, and leaves it out of the Gruppe and the inventory when asked — FR-31.14', () => {
    seedTrip()
    seedGroup()
    const actions = build()
    const { excursionId } = actions.createExcursion(TRIP_ID, {
      name: 'H',
      startsOn: null,
      endsOn: null,
      travelerIds: null,
      templateId: GROUP_ID,
    })!
    pullIn(ctx.tripStore, TABLE.excursionItems, 'l-bar', {
      trip_id: TRIP_ID,
      excursion_id: excursionId,
      name: 'Schokoriegel',
    })
    expect(actions.unlistedNames(TRIP_ID, excursionId)).toEqual(['Schokoriegel'])

    const groupId = actions.saveAsGroup(TRIP_ID, excursionId, 'Hütte ohne Kram', false)!

    const names = ctx.masterStore
      .getTemplateItems(groupId)
      .map((p) => ctx.masterStore.getItem(p.item_id)!.name)
    expect(names).not.toContain('Schokoriegel')
    expect(names).toContain('Stirnlampe')
    expect(ctx.masterStore.activeItemList.some((i) => i.name === 'Schokoriegel')).toBe(false)
  })

  it('refuses a name another Vorlage already has', () => {
    seedTrip()
    seedGroup()
    const actions = build()
    const { excursionId } = actions.createExcursion(TRIP_ID, {
      name: 'H',
      startsOn: null,
      endsOn: null,
      travelerIds: null,
      templateId: null,
    })!
    expect(actions.saveAsGroup(TRIP_ID, excursionId, 'Hüttenübernachtung')).toBeNull()
  })
})

describe('addToPackingList — FR-31.13', () => {
  function boughtLine(name: string, extra: Record<string, unknown> = {}) {
    pullIn(ctx.tripStore, TABLE.excursions, 'ex-1', { trip_id: TRIP_ID, name: 'Hütte' })
    pullIn(ctx.tripStore, TABLE.excursionItems, 'l-1', {
      trip_id: TRIP_ID,
      excursion_id: 'ex-1',
      name,
      quantity: 2,
      mode: 'buy_local',
      bought_at: '2026-07-16T08:00:00Z',
      ...extra,
    })
    return lines().find((l) => l.id === 'l-1')!
  }

  it('makes a bought line a packed suitcase row of a new inventory item, and undoes all of it', () => {
    seedTrip({ packing_closed_at: '2026-05-30T20:00:00Z' })
    const actions = build()
    const undo = actions.addToPackingList(
      TRIP_ID,
      boughtLine('Regencape', { assigned_traveler_id: 'tr-sia' }),
    )!

    const item = ctx.masterStore.itemList.find((i) => i.name === 'Regencape')!
    const row = ctx.tripStore.getItems(TRIP_ID).find((t) => t.name === 'Regencape')!
    expect(row).toMatchObject({
      source_item_id: item.id,
      quantity: 2,
      packed_count: 2,
      state: 'packed',
      assigned_traveler_id: 'tr-sia',
    })
    expect(lines()[0]).toMatchObject({
      trip_item_id: row.id,
      source_item_id: item.id,
      bought_at: '2026-07-16T08:00:00Z',
    })

    undo()

    expect(ctx.tripStore.getItems(TRIP_ID).some((t) => t.name === 'Regencape')).toBe(false)
    expect(lines()[0]).toMatchObject({ trip_item_id: null, source_item_id: null })
    expect(ctx.masterStore.activeItemList.some((i) => i.name === 'Regencape')).toBe(false)
  })

  it('names the inventory item the trip already knows rather than a second one', () => {
    seedTrip()
    pullIn(ctx.masterStore, TABLE.items, 'item-cape', { name: 'Regencape' })
    build().addToPackingList(TRIP_ID, boughtLine('regencape'))
    expect(
      ctx.masterStore.itemList.filter((i) => i.name.toLowerCase() === 'regencape'),
    ).toHaveLength(1)
    expect(ctx.tripStore.getItems(TRIP_ID)[0]!.source_item_id).toBe('item-cape')
  })

  it('refuses a line not bought, or already a suitcase row', () => {
    seedTrip()
    expect(
      build().addToPackingList(TRIP_ID, boughtLine('Proviant', { bought_at: null })),
    ).toBeNull()
    expect(queued.some((q) => q.muts.some((m) => m.mutation.table === TABLE.tripItems))).toBe(false)
  })
})

describe('addGroupLines — FR-31.2 on an existing excursion', () => {
  it('adds the group over the participants and leaves out what the list carries', () => {
    seedTrip()
    seedGroup()
    const actions = build()
    const { excursionId } = actions.createExcursion(TRIP_ID, {
      name: 'H',
      startsOn: null,
      endsOn: null,
      travelerIds: null,
      templateId: null,
    })!
    pullIn(ctx.tripStore, TABLE.excursionItems, 'l-lamp', {
      trip_id: TRIP_ID,
      excursion_id: excursionId,
      name: 'Stirnlampe',
      source_item_id: 'item-lamp',
    })

    const written = actions.addGroupLines(TRIP_ID, excursionId, GROUP_ID)!

    expect(written.lines).toBe(3)
    expect(lines().filter((l) => l.name === 'Stirnlampe')).toHaveLength(1)
    expect(lines().filter((l) => l.name === 'Hüttenschlafsack')).toHaveLength(2)
  })
})

describe('addLines with a decision — the browse sheet’s ✓ and ✕ (FR-25.13f)', () => {
  function lamp() {
    return {
      source_item_id: 'item-lamp',
      name: 'Stirnlampe',
      category_name: null,
      assigned_traveler_id: null,
      quantity: 1,
      mode: 'pack' as const,
      for_all_participants: false,
      weight_grams: null,
      value_cents: null,
      source_template_id: null,
    }
  }

  function emptyExcursion(actions: ReturnType<typeof build>) {
    return actions.createExcursion(TRIP_ID, {
      name: 'H',
      startsOn: null,
      endsOn: null,
      travelerIds: null,
      templateId: null,
    })!.excursionId
  }

  it('writes a packed line, linked into the suitcase like an open add', () => {
    seedTrip()
    const actions = build()
    const excursionId = emptyExcursion(actions)

    const written = actions.addLines(TRIP_ID, excursionId, [lamp()], 'packed')

    const row = ctx.tripStore.getItems(TRIP_ID)[0]!
    expect(row).toMatchObject({ name: 'Stirnlampe', state: 'open' })
    expect(lines()[0]).toMatchObject({
      trip_item_id: row.id,
      quantity: 1,
      packed_count: 1,
      state: 'packed',
    })

    written.undo()

    expect(lines()).toEqual([])
    expect(ctx.tripStore.getItems(TRIP_ID)).toEqual([])
  })

  it('writes a skipped line at an amount of zero, and the suitcase gains nothing for it', () => {
    seedTrip()
    const actions = build()
    const excursionId = emptyExcursion(actions)

    actions.addLines(TRIP_ID, excursionId, [lamp()], 'skipped')

    expect(ctx.tripStore.getItems(TRIP_ID)).toEqual([])
    expect(lines()[0]).toMatchObject({
      trip_item_id: null,
      quantity: 0,
      packed_count: 0,
      state: 'skipped',
      not_in_luggage: false,
    })
  })
})

describe('setForWhom — FR-31.5 from the line’s sheet', () => {
  it('makes a shared line one per participant, and undoes it as one', () => {
    seedTrip()
    const actions = build()
    const { excursionId } = actions.createExcursion(TRIP_ID, {
      name: 'H',
      startsOn: null,
      endsOn: null,
      travelerIds: null,
      templateId: null,
    })!
    pullIn(ctx.tripStore, TABLE.excursionItems, 'l-bag', {
      trip_id: TRIP_ID,
      excursion_id: excursionId,
      name: 'Schlafsack',
    })

    const undo = actions.setForWhom(TRIP_ID, lines()[0]!, { kind: 'all' })

    expect(
      lines()
        .map((l) => [l.assigned_traveler_id, l.for_all_participants])
        .sort(),
    ).toEqual([
      ['tr-andy', true],
      ['tr-sia', true],
    ])

    undo()

    expect(lines().map((l) => [l.id, l.assigned_traveler_id])).toEqual([['l-bag', null]])
  })
})

describe('adoptIntoInventory — FR-31.14', () => {
  it('makes a line of the excursion alone an inventory item, linked into the open suitcase, and undoes it', () => {
    seedTrip()
    const actions = build()
    const { excursionId } = actions.createExcursion(TRIP_ID, {
      name: 'H',
      startsOn: null,
      endsOn: null,
      travelerIds: null,
      templateId: null,
    })!
    actions.addLines(TRIP_ID, excursionId, [
      {
        source_item_id: null,
        name: 'Schokoriegel',
        category_name: null,
        assigned_traveler_id: null,
        quantity: 2,
        mode: 'pack',
        for_all_participants: false,
        weight_grams: null,
        value_cents: null,
        source_template_id: null,
      },
    ])
    // The excursion's alone: no suitcase row, no inventory item.
    expect(ctx.tripStore.getItems(TRIP_ID)).toEqual([])
    expect(lines()[0]).toMatchObject({ source_item_id: null, trip_item_id: null })

    const undo = actions.adoptIntoInventory(TRIP_ID, lines()[0]!)!

    const item = ctx.masterStore.activeItemList.find((i) => i.name === 'Schokoriegel')!
    const row = ctx.tripStore.getItems(TRIP_ID)[0]!
    expect(row).toMatchObject({ name: 'Schokoriegel', source_item_id: item.id, quantity: 2 })
    expect(lines()[0]).toMatchObject({ source_item_id: item.id, trip_item_id: row.id })

    undo()

    expect(ctx.tripStore.getItems(TRIP_ID)).toEqual([])
    expect(lines()[0]).toMatchObject({ source_item_id: null, trip_item_id: null })
    expect(ctx.masterStore.activeItemList.some((i) => i.name === 'Schokoriegel')).toBe(false)
  })
})
