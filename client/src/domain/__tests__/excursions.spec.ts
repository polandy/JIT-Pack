/**
 * FR-31 — excursions: who goes, what a Gruppe amounts to for them, which
 * suitcase row a line borrows, what a change of participants does, how the
 * list reads, where it stands in time, and what saving it as a Gruppe writes.
 */
import { describe, expect, it } from 'vitest'

import {
  arrangeExcursions,
  borrowersByTripItem,
  dayAfter,
  dueExcursions,
  draftLinesFor,
  draftLinesFromGroup,
  excursionView,
  isDueSoon,
  isLeftBehind,
  isOpenPurchase,
  pendingExcursionCount,
  participantsOf,
  planGroupFromExcursion,
  planLinks,
  planParticipantChange,
  whenOf,
  type DraftLine,
  type GroupDraftInput,
} from '../excursions'
import type {
  CategorisedMasterItem,
  ExcursionItem,
  ExcursionTraveler,
  Template,
  TemplateItem,
  Traveler,
  TripItem,
} from '@/types/domain'

const andy = traveler('tr-andy', 'Andy')
const sia = traveler('tr-sia', 'Sia')
const lio = traveler('tr-lio', 'Lio')

function traveler(id: string, name: string): Traveler {
  return { id, trip_id: 'trip-1', name, linked_user_id: null }
}

function group(id: string, name: string): Template {
  return { id, owner_id: 'user-a', name, kind: 'group' }
}

function masterItem(
  id: string,
  name: string,
  category: string | null = null,
): CategorisedMasterItem {
  return { id, name, weight_grams: 100, value_cents: null, category_name: category }
}

function position(id: string, itemId: string, extra: Partial<TemplateItem> = {}): TemplateItem {
  return {
    id,
    template_id: 'grp-hut',
    item_id: itemId,
    quantity: 1,
    assignment: 'trip_global',
    dedup: 'max',
    conditions: null,
    default_mode: 'pack',
    late_packer: false,
    ...extra,
  }
}

function tripItem(id: string, name: string, extra: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: 'trip-1',
    source_item_id: null,
    source_template_id: null,
    name,
    weight_grams: null,
    value_cents: null,
    category_name: null,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    bought_from: null,
    bought_at: null,
    bought_by_user_id: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '1',
    ...extra,
  }
}

function line(id: string, name: string, extra: Partial<ExcursionItem> = {}): ExcursionItem {
  return {
    id,
    trip_id: 'trip-1',
    excursion_id: 'ex-1',
    trip_item_id: null,
    source_item_id: null,
    name,
    category_name: null,
    assigned_traveler_id: null,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    bought_at: null,
    not_in_luggage: false,
    for_all_participants: false,
    ...extra,
  }
}

function draft(name: string, extra: Partial<DraftLine> = {}): DraftLine {
  return {
    source_item_id: null,
    name,
    category_name: null,
    assigned_traveler_id: null,
    quantity: 1,
    mode: 'pack',
    for_all_participants: false,
    weight_grams: null,
    value_cents: null,
    source_template_id: null,
    ...extra,
  }
}

describe('participantsOf — FR-31.3', () => {
  const rows: ExcursionTraveler[] = [
    { id: 'p1', trip_id: 'trip-1', excursion_id: 'ex-1', traveler_id: 'tr-sia' },
    { id: 'p2', trip_id: 'trip-1', excursion_id: 'ex-1', traveler_id: 'tr-andy' },
    { id: 'p3', trip_id: 'trip-1', excursion_id: 'ex-2', traveler_id: 'tr-lio' },
  ]

  it('names the named people in the roster order, not the order they were added', () => {
    expect(participantsOf('ex-1', rows, [andy, sia, lio]).map((t) => t.name)).toEqual([
      'Andy',
      'Sia',
    ])
  })

  it('takes every traveller when it names nobody, so a later traveller is on it', () => {
    expect(participantsOf('ex-3', rows, [andy, sia, lio]).map((t) => t.name)).toEqual([
      'Andy',
      'Sia',
      'Lio',
    ])
  })

  it('drops a named traveller the trip no longer has', () => {
    expect(participantsOf('ex-2', rows, [andy, sia])).toEqual([])
  })
})

describe('draftLinesFromGroup — FR-31.2', () => {
  function input(overrides: Partial<GroupDraftInput> = {}): GroupDraftInput {
    return {
      templateId: 'grp-hut',
      templates: [group('grp-hut', 'Hüttenübernachtung')],
      includes: [],
      templateItems: [
        position('ti-1', 'item-bag', { assignment: 'per_person' }),
        position('ti-2', 'item-lamp', { quantity: 2 }),
        position('ti-3', 'item-food', { default_mode: 'buy_local' }),
        position('ti-4', 'item-cream', { default_mode: 'buy_before' }),
      ],
      templateItemTasks: [],
      masterItems: [
        masterItem('item-bag', 'Hüttenschlafsack', 'Schlafen'),
        masterItem('item-lamp', 'Stirnlampe'),
        masterItem('item-food', 'Proviant'),
        masterItem('item-cream', 'Sonnencreme'),
      ],
      attributes: null,
      participants: [andy, sia],
      ...overrides,
    }
  }

  it('fans a per-person position out over the participants and remembers it as für alle', () => {
    const bags = draftLinesFromGroup(input()).filter((d) => d.name === 'Hüttenschlafsack')
    expect(
      bags.map((d) => [d.assigned_traveler_id, d.for_all_participants, d.category_name]),
    ).toEqual([
      ['tr-andy', true, 'Schlafen'],
      ['tr-sia', true, 'Schlafen'],
    ])
  })

  it('keeps a shared position one line for nobody in particular, with its amount', () => {
    const lamp = draftLinesFromGroup(input()).find((d) => d.name === 'Stirnlampe')!
    expect([lamp.assigned_traveler_id, lamp.for_all_participants, lamp.quantity]).toEqual([
      null,
      false,
      2,
    ])
  })

  it('reads vor Ort as vor Ort and a purchase before departure as packing', () => {
    const modes = Object.fromEntries(draftLinesFromGroup(input()).map((d) => [d.name, d.mode]))
    expect(modes['Proviant']).toBe('buy_local')
    expect(modes['Sonnencreme']).toBe('pack')
  })

  it('names nobody on a shared line even where the item has a default assignee (FR-1.9)', () => {
    const lamp = draftLinesFromGroup(
      input({
        masterItems: [
          { ...masterItem('item-lamp', 'Stirnlampe'), default_assignee_id: 'user-andy' },
        ],
        templateItems: [position('ti-2', 'item-lamp')],
        participants: [{ ...andy, linked_user_id: 'user-andy' }],
      }),
    )[0]!
    expect(lamp.assigned_traveler_id).toBeNull()
  })
})

describe('draftLinesFor — the composer for whom (FR-31.5)', () => {
  const base = {
    source_item_id: null,
    name: 'Ohrstöpsel',
    category_name: null,
    quantity: 1,
    mode: 'pack' as const,
    weight_grams: null,
    value_cents: null,
    source_template_id: null,
  }

  it('writes one shared line for Gemeinsam', () => {
    expect(draftLinesFor(base, { kind: 'shared' }, [andy, sia])).toHaveLength(1)
  })

  it('writes a line per participant for Alle, remembered as für alle', () => {
    const lines = draftLinesFor(base, { kind: 'all' }, [andy, sia])
    expect(lines.map((l) => [l.assigned_traveler_id, l.for_all_participants])).toEqual([
      ['tr-andy', true],
      ['tr-sia', true],
    ])
  })

  it('writes lines for the named participants only, not für alle, and nobody who does not go', () => {
    const lines = draftLinesFor(base, { kind: 'named', travelerIds: ['tr-sia', 'tr-lio'] }, [
      andy,
      sia,
    ])
    expect(lines.map((l) => [l.assigned_traveler_id, l.for_all_participants])).toEqual([
      ['tr-sia', false],
    ])
  })
})

describe('planLinks — FR-31.4, FR-31.7', () => {
  it('borrows the suitcase row by master item and raises it to the line’s amount — max, not sum', () => {
    const bottle = tripItem('ti-bottle', 'Trinkflasche', {
      source_item_id: 'item-bottle',
      quantity: 2,
    })
    const plan = planLinks(
      [draft('Trinkflasche', { source_item_id: 'item-bottle', quantity: 4 })],
      [bottle],
      true,
    )
    expect(plan.lines[0]!.link).toEqual({ existing: 'ti-bottle' })
    expect(plan.suitcase).toEqual([{ kind: 'raise', tripItem: bottle, quantity: 4 }])
  })

  it('never lowers the suitcase: a line asking for less than it holds writes nothing', () => {
    const plan = planLinks(
      [draft('Trinkflasche', { source_item_id: 'item-bottle', quantity: 1 })],
      [tripItem('ti-bottle', 'Trinkflasche', { source_item_id: 'item-bottle', quantity: 4 })],
      true,
    )
    expect(plan.suitcase).toEqual([])
  })

  it('finds a hand-typed suitcase row by name', () => {
    const plan = planLinks(
      [draft('Stirnlampe', { source_item_id: 'item-lamp' })],
      [tripItem('ti-lamp', ' stirnlampe')],
      true,
    )
    expect(plan.lines[0]!.link).toEqual({ existing: 'ti-lamp' })
  })

  it('links a per-participant line to that person’s own row, never another’s', () => {
    const plan = planLinks(
      [draft('Schlafsack', { source_item_id: 'item-bag', assigned_traveler_id: 'tr-sia' })],
      [
        tripItem('ti-andy', 'Schlafsack', {
          source_item_id: 'item-bag',
          assigned_traveler_id: 'tr-andy',
        }),
        tripItem('ti-sia', 'Schlafsack', {
          source_item_id: 'item-bag',
          assigned_traveler_id: 'tr-sia',
        }),
      ],
      true,
    )
    expect(plan.lines[0]!.link).toEqual({ existing: 'ti-sia' })
  })

  it('creates what the suitcase lacks while it is open, once for two lines naming it', () => {
    const plan = planLinks(
      [
        draft('Stirnlampe', { source_item_id: 'item-lamp' }),
        draft('Stirnlampe', { source_item_id: 'item-lamp', quantity: 2 }),
      ],
      [],
      true,
    )
    expect(plan.suitcase).toHaveLength(1)
    const create = plan.suitcase[0]!
    expect(
      create.kind === 'create' && [create.fields.name, create.fields.quantity, create.fields.mode],
    ).toEqual(['Stirnlampe', 2, 'pack'])
    expect(plan.lines.map((l) => l.link)).toEqual([
      { created: 'create:0' },
      { created: 'create:0' },
    ])
  })

  it('does not revive a row decided bewusst nicht mitgenommen, and says it is not in the luggage', () => {
    const plan = planLinks(
      [draft('Zelt', { quantity: 1 })],
      [tripItem('ti-tent', 'Zelt', { quantity: 0, state: 'skipped' })],
      true,
    )
    expect(plan.suitcase).toEqual([])
    expect(plan.lines[0]).toMatchObject({ link: { existing: 'ti-tent' }, not_in_luggage: true })
  })

  it('leaves a vor-Ort line off the suitcase entirely', () => {
    const plan = planLinks(
      [draft('Proviant', { mode: 'buy_local' })],
      [tripItem('ti-x', 'Proviant')],
      true,
    )
    expect(plan).toEqual({
      lines: [{ draft: expect.anything(), link: null, not_in_luggage: false }],
      suitcase: [],
    })
  })

  it('writes nothing to a closed suitcase: a packed row is borrowed, anything else is not in the luggage', () => {
    const plan = planLinks(
      [draft('Wanderschuhe'), draft('Stirnlampe'), draft('Hüttenschlafsack')],
      [
        tripItem('ti-shoes', 'Wanderschuhe', { packed_count: 1, state: 'packed' }),
        tripItem('ti-lamp', 'Stirnlampe', { quantity: 0, state: 'skipped' }),
      ],
      false,
    )
    expect(plan.suitcase).toEqual([])
    expect(plan.lines.map((l) => [l.link, l.not_in_luggage])).toEqual([
      [{ existing: 'ti-shoes' }, false],
      [{ existing: 'ti-lamp' }, true],
      [null, true],
    ])
  })
})

describe('planParticipantChange — FR-31.5', () => {
  const lines = [
    line('l-andy', 'Hüttenschlafsack', {
      assigned_traveler_id: 'tr-andy',
      for_all_participants: true,
      source_item_id: 'item-bag',
      packed_count: 1,
      state: 'packed',
    }),
    line('l-sia', 'Hüttenschlafsack', {
      assigned_traveler_id: 'tr-sia',
      for_all_participants: true,
      source_item_id: 'item-bag',
      packed_count: 1,
      state: 'packed',
    }),
    line('l-sia-plugs', 'Ohrstöpsel', {
      assigned_traveler_id: 'tr-sia',
      for_all_participants: true,
      quantity: 2,
    }),
    line('l-andy-plugs', 'Ohrstöpsel', {
      assigned_traveler_id: 'tr-andy',
      for_all_participants: true,
      quantity: 2,
    }),
    line('l-sia-book', 'Buch', { assigned_traveler_id: 'tr-sia' }),
    line('l-lamp', 'Stirnlampe'),
  ]

  it('grows every für-alle set for a joiner at the shared amount, and nothing else', () => {
    const change = planParticipantChange(lines, [andy, sia], [andy, sia, lio])
    expect(
      change.add.map((d) => [d.name, d.assigned_traveler_id, d.quantity, d.for_all_participants]),
    ).toEqual([
      ['Hüttenschlafsack', 'tr-lio', 1, true],
      ['Ohrstöpsel', 'tr-lio', 2, true],
    ])
    expect(change.remove).toEqual([])
  })

  it('takes a leaver’s open lines and keeps what is already in the rucksack', () => {
    const change = planParticipantChange(lines, [andy, sia], [andy])
    expect(change.remove.map((l) => l.id)).toEqual(['l-sia-plugs', 'l-sia-book'])
    expect(change.add).toEqual([])
  })

  it('gives a joiner one where the set’s amounts differ', () => {
    const uneven = [
      line('a', 'Socken', {
        assigned_traveler_id: 'tr-andy',
        for_all_participants: true,
        quantity: 2,
      }),
      line('b', 'Socken', {
        assigned_traveler_id: 'tr-sia',
        for_all_participants: true,
        quantity: 3,
      }),
    ]
    expect(planParticipantChange(uneven, [andy, sia], [andy, sia, lio]).add[0]!.quantity).toBe(1)
  })
})

describe('excursionView — FR-31.6', () => {
  it('groups by category, clusters per-person lines in the participants’ order and counts units', () => {
    const view = excursionView(
      [
        line('l1', 'Stirnlampe', { category_name: 'Schlafen', quantity: 2 }),
        line('l2', 'Hüttenschlafsack', {
          category_name: 'Schlafen',
          assigned_traveler_id: 'tr-sia',
          for_all_participants: true,
        }),
        line('l3', 'Hüttenschlafsack', {
          category_name: 'Schlafen',
          assigned_traveler_id: 'tr-andy',
          for_all_participants: true,
          packed_count: 1,
          state: 'packed',
        }),
        line('l4', 'Proviant', { mode: 'buy_local' }),
        line('l5', 'Zelt', { category_name: 'Schlafen', quantity: 0, state: 'skipped' }),
      ],
      [andy, sia],
    )
    expect(view.map((g) => [g.category, g.units])).toEqual([
      ['Schlafen', { done: 1, total: 4 }],
      [null, { done: 0, total: 1 }],
    ])
    const cluster = view[0]!.entries[0]!
    expect(
      cluster.kind === 'cluster' && [cluster.name, cluster.units, cluster.lines.map((l) => l.id)],
    ).toEqual(['Hüttenschlafsack', { done: 1, total: 2 }, ['l3', 'l2']])
  })
})

describe('the line’s own facts', () => {
  it('reads a packed line of somebody who no longer goes as left behind (FR-31.5)', () => {
    expect(isLeftBehind(line('l', 'x', { assigned_traveler_id: 'tr-sia' }), [andy])).toBe(true)
    expect(isLeftBehind(line('l', 'x', { assigned_traveler_id: 'tr-andy' }), [andy])).toBe(false)
    expect(isLeftBehind(line('l', 'x'), [andy])).toBe(false)
  })

  it('reads a vor-Ort line as still to buy until it is bought or skipped (FR-31.8)', () => {
    expect(isOpenPurchase(line('l', 'x', { mode: 'buy_local' }))).toBe(true)
    expect(
      isOpenPurchase(line('l', 'x', { mode: 'buy_local', bought_at: '2026-07-14T07:00:00Z' })),
    ).toBe(false)
    expect(
      isOpenPurchase(line('l', 'x', { mode: 'buy_local', quantity: 0, state: 'skipped' })),
    ).toBe(false)
    expect(isOpenPurchase(line('l', 'x'))).toBe(false)
  })
})

describe('time — FR-31.10', () => {
  const today = '2026-07-15'

  it('places an excursion as upcoming through its last day, then past, and undated without one', () => {
    expect(whenOf({ starts_on: '2026-07-14', ends_on: '2026-07-15' }, today)).toBe('upcoming')
    expect(whenOf({ starts_on: '2026-07-14', ends_on: '2026-07-14' }, today)).toBe('past')
    expect(whenOf({ starts_on: null, ends_on: null }, today)).toBe('undated')
    // A reversed pair, which field-level LWW can leave, reads as its min and max.
    expect(whenOf({ starts_on: '2026-07-16', ends_on: '2026-07-14' }, today)).toBe('upcoming')
  })

  it('lists upcoming by first day, undated by name, past latest first', () => {
    const ex = (name: string, starts_on: string | null, ends_on = starts_on) => ({
      name,
      starts_on,
      ends_on,
    })
    const arranged = arrangeExcursions(
      [
        ex('Boot', null),
        ex('Hütte', '2026-07-17', '2026-07-18'),
        ex('Wandern', '2026-07-15'),
        ex('Alt', '2026-07-10'),
        ex('Älter', '2026-07-02'),
        ex('Angeln', null),
      ],
      today,
    )
    expect(arranged.upcoming.map((e) => e.name)).toEqual(['Wandern', 'Hütte'])
    expect(arranged.undated.map((e) => e.name)).toEqual(['Angeln', 'Boot'])
    expect(arranged.past.map((e) => e.name)).toEqual(['Alt', 'Älter'])
  })

  it('is due on the dashboard the day before and the day it starts, while something is open', () => {
    const open = [line('l', 'x')]
    const done = [line('l', 'x', { packed_count: 1, state: 'packed' })]
    const hike = { starts_on: '2026-07-16', ends_on: '2026-07-16' }
    expect(isDueSoon(hike, open, today, '2026-07-16')).toBe(true)
    expect(isDueSoon(hike, open, '2026-07-16', '2026-07-17')).toBe(true)
    expect(isDueSoon(hike, open, '2026-07-14', today)).toBe(false)
    expect(isDueSoon(hike, done, today, '2026-07-16')).toBe(false)
    expect(isDueSoon({ starts_on: null, ends_on: null }, open, today, '2026-07-16')).toBe(false)
  })
})

describe('pendingExcursionCount — the pill’s badge (FR-31.10)', () => {
  it('counts the excursions ahead, today’s included, that still have something open', () => {
    const ex = (id: string, starts_on: string | null) => ({
      id,
      trip_id: 'trip-1',
      name: id,
      starts_on,
      ends_on: starts_on,
      source_template_id: null,
    })
    const open = (excursion_id: string) => line(`l-${excursion_id}`, 'x', { excursion_id })
    const done = (excursion_id: string) =>
      line(`d-${excursion_id}`, 'x', { excursion_id, packed_count: 1, state: 'packed' })
    expect(
      pendingExcursionCount(
        [
          ex('today', '2026-07-15'),
          ex('ahead', '2026-07-20'),
          ex('done', '2026-07-18'),
          ex('past', '2026-07-10'),
          ex('undated', null),
        ],
        [open('today'), open('ahead'), done('done'), open('past'), open('undated')],
        '2026-07-15',
      ),
    ).toBe(2)
  })
})

describe('borrowersByTripItem — M4’s hint (FR-31.12)', () => {
  it('names each excursion ahead once per suitcase row it borrows, and no past one', () => {
    const ex = (id: string, name: string, day: string | null) => ({
      id,
      trip_id: 'trip-1',
      name,
      starts_on: day,
      ends_on: day,
      source_template_id: null,
    })
    const map = borrowersByTripItem(
      [ex('e1', 'Hüttentour', '2026-07-17'), ex('e2', 'Boot', null), ex('e3', 'Alt', '2026-07-01')],
      [
        line('a', 'Schlafsack', { excursion_id: 'e1', trip_item_id: 'ti-bag' }),
        line('b', 'Schlafsack', { excursion_id: 'e1', trip_item_id: 'ti-bag' }),
        line('c', 'Schlafsack', { excursion_id: 'e2', trip_item_id: 'ti-bag' }),
        line('d', 'Lampe', { excursion_id: 'e3', trip_item_id: 'ti-lamp' }),
        line('e', 'Proviant', { excursion_id: 'e1' }),
      ],
      '2026-07-15',
    )
    expect([...map]).toEqual([['ti-bag', ['Hüttentour', 'Boot']]])
  })
})

describe('dueExcursions — M1 (FR-31.10)', () => {
  it('lists today’s and tomorrow’s excursions with something open across trips, today first', () => {
    const ex = (id: string, name: string, day: string) => ({
      id,
      trip_id: 't',
      name,
      starts_on: day,
      ends_on: day,
      source_template_id: null,
    })
    const rows = dueExcursions(
      [
        {
          id: 't1',
          name: 'Sardinien',
          excursions: [
            ex('a', 'Hütte', '2026-07-16'),
            ex('b', 'Wandern', '2026-07-15'),
            ex('c', 'Boot', '2026-07-20'),
          ],
          lines: [
            line('1', 'x', { excursion_id: 'a' }),
            line('2', 'x', { excursion_id: 'b' }),
            line('3', 'x', { excursion_id: 'c' }),
          ],
        },
      ],
      '2026-07-15',
    )
    expect(rows.map((r) => [r.excursion.name, r.today, r.tripName])).toEqual([
      ['Wandern', true, 'Sardinien'],
      ['Hütte', false, 'Sardinien'],
    ])
  })

  it('steps across a month end', () => {
    expect(dayAfter('2026-07-31')).toBe('2026-08-01')
    expect(dayAfter('2026-12-31')).toBe('2027-01-01')
  })
})

describe('planGroupFromExcursion — FR-31.11', () => {
  it('folds a für-alle set to one per-person position, keeps vor Ort, skips the skipped, names new items', () => {
    const plan = planGroupFromExcursion(
      [
        line('a', 'Hüttenschlafsack', {
          source_item_id: 'item-bag',
          assigned_traveler_id: 'tr-andy',
          for_all_participants: true,
        }),
        line('b', 'Hüttenschlafsack', {
          source_item_id: 'item-bag',
          assigned_traveler_id: 'tr-sia',
          for_all_participants: true,
        }),
        line('c', 'Proviant', { mode: 'buy_local', quantity: 2 }),
        line('d', 'Kartenspiel'),
        line('e', 'Zelt', { quantity: 0, state: 'skipped' }),
      ],
      [{ id: 'item-food', name: 'proviant', weight_grams: null, value_cents: null }],
    )
    expect(plan.newMasterItems).toEqual(['Kartenspiel'])
    expect(plan.positions).toEqual([
      {
        name: 'Hüttenschlafsack',
        itemId: 'item-bag',
        quantity: 1,
        assignment: 'per_person',
        default_mode: 'pack',
      },
      {
        name: 'proviant',
        itemId: 'item-food',
        quantity: 2,
        assignment: 'trip_global',
        default_mode: 'buy_local',
      },
      {
        name: 'Kartenspiel',
        itemId: null,
        quantity: 1,
        assignment: 'trip_global',
        default_mode: 'pack',
      },
    ])
  })
})
