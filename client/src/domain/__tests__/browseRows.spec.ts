/**
 * FR-25.13f — the browse sheet lists master items, the trip carries rows.
 * The summary decides which verb a line may offer; `browseRowView` turns it,
 * and the sheet's own run, into what the line renders.
 */
import { describe, expect, it } from 'vitest'

import {
  browseOffer,
  browseRowStates,
  browseRowView,
  plainBrowseScope,
  type BrowseRowSummary,
  type BrowseRunState,
  type BrowseScope,
} from '../browseRows'
import type { Traveler, TripItem } from '@/types/domain'

const TRIP = 'trip-1'
const SHORTS = 'item-shorts'
const NEVER_LOCKED = () => null
const NOBODY: Traveler[] = []

function traveler(id: string, name: string): Traveler {
  return { id, trip_id: TRIP, name, linked_user_id: null }
}

const ROSTER = [traveler('tr-a', 'Andy'), traveler('tr-b', 'Nina'), traveler('tr-c', 'Mila')]
const HELD_BY_SIA = 'Sia packt das gerade'

function row(id: string, extra: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: TRIP,
    source_item_id: SHORTS,
    source_template_id: null,
    name: 'Kurze Hosen',
    weight_grams: null,
    value_cents: null,
    category_name: 'Kleidung',
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
    flag_unused: false,
    flag_missing: false,
    bought_from: null,
    bought_at: null,
    bought_by_user_id: null,
    updated_hlc: '',
    ...extra,
  }
}

describe('browseRowStates', () => {
  it('reports an open row as open, and names the row the verb would act on', () => {
    const states = browseRowStates([row('r1')], NEVER_LOCKED, NOBODY)

    expect(states.get(SHORTS)).toEqual({
      state: 'open',
      itemIds: ['r1'],
      travelersReached: 0,
      lockNote: null,
    })
  })

  it('leaves a hand-typed row out — the sheet cannot match it to an inventory line', () => {
    const states = browseRowStates([row('r1', { source_item_id: null })], NEVER_LOCKED, NOBODY)

    expect(states.size).toBe(0)
  })

  it('settles a set only when every row agrees', () => {
    const cases: { name: string; rows: TripItem[]; state: string }[] = [
      { name: 'all packed', rows: [row('r1', { state: 'packed' })], state: 'packed' },
      { name: 'all skipped', rows: [row('r1', { state: 'skipped' })], state: 'skipped' },
      {
        name: 'half a per-person set packed',
        rows: [row('r1', { state: 'packed' }), row('r2')],
        state: 'open',
      },
      {
        name: 'packed beside skipped',
        rows: [row('r1', { state: 'packed' }), row('r2', { state: 'skipped' })],
        state: 'open',
      },
      { name: 'partially packed', rows: [row('r1', { state: 'partial' })], state: 'open' },
    ]

    const actual = cases.map(({ name, rows }) => ({
      name,
      state: browseRowStates(rows, NEVER_LOCKED, NOBODY).get(SHORTS)?.state,
    }))

    // Compared as a whole rather than asserted per case: a failure then names
    // which of the five disagreed instead of stopping at the first.
    expect(actual).toEqual(cases.map(({ name, state }) => ({ name, state })))
  })

  it('collects a per-person fan-out into one summary, in list order', () => {
    const states = browseRowStates([row('r1'), row('r2'), row('r3')], NEVER_LOCKED, NOBODY)

    expect(states.get(SHORTS)).toEqual({
      state: 'open',
      itemIds: ['r1', 'r2', 'r3'],
      travelersReached: 0,
      lockNote: null,
    })
  })

  it('locks the whole set when one of its rows is held by somebody else, and says who (G-3)', () => {
    const states = browseRowStates(
      [row('r1'), row('r2', { packing_now_by: 'user-sia' })],
      (item) => (item.packing_now_by === 'user-sia' ? HELD_BY_SIA : null),
      NOBODY,
    )

    expect(states.get(SHORTS)).toEqual({
      state: 'locked',
      itemIds: ['r1', 'r2'],
      travelersReached: 0,
      lockNote: HELD_BY_SIA,
    })
  })

  it('lets the lock win over a set that is otherwise settled', () => {
    const states = browseRowStates([row('r1', { state: 'packed' })], () => HELD_BY_SIA, NOBODY)

    expect(states.get(SHORTS)?.state).toBe('locked')
  })

  it('keeps master items apart', () => {
    const states = browseRowStates(
      [row('r1'), row('r2', { source_item_id: 'item-towel', state: 'packed' })],
      NEVER_LOCKED,
      NOBODY,
    )

    expect(states.get(SHORTS)?.state).toBe('open')
    expect(states.get('item-towel')?.state).toBe('packed')
  })

  describe('travelersReached (FR-25.13g)', () => {
    it('counts the travelers of the roster that have a row of their own', () => {
      const states = browseRowStates(
        [row('r1', { assigned_traveler_id: 'tr-a' }), row('r2', { assigned_traveler_id: 'tr-b' })],
        NEVER_LOCKED,
        ROSTER,
      )

      expect(states.get(SHORTS)?.travelersReached).toBe(2)
    })

    it('counts a shared row as reaching nobody — it belongs to no traveler', () => {
      const states = browseRowStates([row('r1')], NEVER_LOCKED, ROSTER)

      expect(states.get(SHORTS)?.travelersReached).toBe(0)
    })

    it('leaves out a row held by somebody who no longer travels', () => {
      const states = browseRowStates(
        [
          row('r1', { assigned_traveler_id: 'tr-a' }),
          row('r2', { assigned_traveler_id: 'tr-gone' }),
        ],
        NEVER_LOCKED,
        ROSTER,
      )

      // Two rows, one traveler: the sheet may still offer to reach the other
      // two, and a count of 2 here would hide the verb that does it.
      expect(states.get(SHORTS)?.travelersReached).toBe(1)
    })

    it('counts one traveler once, however many rows they hold', () => {
      const states = browseRowStates(
        [row('r1', { assigned_traveler_id: 'tr-a' }), row('r2', { assigned_traveler_id: 'tr-a' })],
        NEVER_LOCKED,
        ROSTER,
      )

      expect(states.get(SHORTS)?.travelersReached).toBe(1)
    })
  })
})

describe('browseOffer', () => {
  it('offers the decision verbs exactly where the scope reports packing states (G-8)', () => {
    expect(browseOffer(plainBrowseScope()).decide).toBe(false)
    expect(browseOffer({ ...plainBrowseScope(), rowStates: new Map() }).decide).toBe(true)
  })

  it('offers „für alle" from two travelers on — one has no membership to distribute', () => {
    const forAll = (travelers: Traveler[]) =>
      browseOffer({ ...plainBrowseScope(), travelers }).forAll

    expect([forAll([]), forAll(ROSTER.slice(0, 1)), forAll(ROSTER.slice(0, 2))]).toEqual([
      false,
      false,
      true,
    ])
  })
})

describe('browseRowView', () => {
  const OPEN: BrowseRowSummary = {
    state: 'open',
    itemIds: ['r1'],
    travelersReached: 0,
    lockNote: null,
  }

  /** M4's scope: it carries the shorts, reports their state and has three travelers. */
  function m4Scope(summary: BrowseRowSummary = OPEN): BrowseScope {
    return {
      carriedItemIds: [SHORTS],
      rowStates: new Map([[SHORTS, summary]]),
      travelers: ROSTER,
    }
  }

  function runOf(scope: BrowseScope, extra: Partial<BrowseRunState> = {}): BrowseRunState {
    return {
      scope,
      offer: browseOffer(scope),
      carried: new Set(scope.carriedItemIds),
      acted: new Map(),
      assigned: new Map(),
      hiddenAtSwitch: null,
      ...extra,
    }
  }

  it('renders an item the scope does not carry as free', () => {
    expect(browseRowView('item-towel', runOf(m4Scope()))).toEqual({ kind: 'free' })
  })

  it('renders a carried line with the spread while somebody is still without a row', () => {
    const cases = [0, 2, 3].map((reached) => ({
      reached,
      view: browseRowView(SHORTS, runOf(m4Scope({ ...OPEN, travelersReached: reached }))),
    }))

    expect(cases).toEqual([
      { reached: 0, view: { kind: 'carried', spread: true } },
      { reached: 2, view: { kind: 'carried', spread: true } },
      { reached: 3, view: { kind: 'carried', spread: false } },
    ])
  })

  it('offers no spread in a scope without travelers to reach', () => {
    const view = browseRowView(SHORTS, runOf(plainBrowseScope([SHORTS])))

    expect(view).toEqual({ kind: 'carried', spread: false })
  })

  it('states a settled line, with the reset wherever the scope reports states (FR-25.13i)', () => {
    const packed = browseRowView(SHORTS, runOf(m4Scope({ ...OPEN, state: 'packed' })))
    const skipped = browseRowView(SHORTS, runOf(m4Scope({ ...OPEN, state: 'skipped' })))

    expect([packed, skipped]).toEqual([
      { kind: 'settled', state: 'packed', reopen: true },
      { kind: 'settled', state: 'skipped', reopen: true },
    ])
  })

  it('lets the lock outrank everything the scope says, and names the holder (G-3)', () => {
    const view = browseRowView(
      SHORTS,
      runOf(m4Scope({ ...OPEN, state: 'locked', lockNote: HELD_BY_SIA })),
    )

    expect(view).toEqual({ kind: 'locked', lockNote: HELD_BY_SIA })
  })

  it("lets this run's own verb outrank the scope, with the way back out", () => {
    const run = runOf(m4Scope({ ...OPEN, state: 'locked', lockNote: HELD_BY_SIA }), {
      acted: new Map([[SHORTS, { verb: 'skipped', rows: 1 }]]),
    })

    expect(browseRowView(SHORTS, run)).toEqual({
      kind: 'acted',
      act: { verb: 'skipped', rows: 1 },
      done: false,
      undoable: true,
    })
  })

  it('keeps an assigned line open for more taps, with who it already has (FR-25.13h)', () => {
    const run = runOf(m4Scope(), {
      acted: new Map([[SHORTS, { verb: 'assigned', rows: 1, travelerName: 'Nina' }]]),
      assigned: new Map([[SHORTS, new Set(['tr-b'])]]),
    })

    expect(browseRowView(SHORTS, run)).toEqual({
      kind: 'assigning',
      act: { verb: 'assigned', rows: 1, travelerName: 'Nina' },
      selected: new Set(['tr-b']),
    })
  })

  it('keeps the ledger silent where the scope has no decision verbs (M8)', () => {
    // M8 has one add and no way back, so its tapped line keeps saying
    // *„schon drin"* as FR-25.13d wrote it.
    const run = runOf(plainBrowseScope([SHORTS]), {
      acted: new Map([[SHORTS, { verb: 'added', rows: 1 }]]),
    })

    expect(browseRowView(SHORTS, run)).toEqual({ kind: 'carried', spread: false })
  })

  it('marks a line added since the hide switch went on, from anywhere, without an undo (FR-25.13e)', () => {
    const view = browseRowView(SHORTS, runOf(m4Scope(), { hiddenAtSwitch: new Set() }))

    expect(view).toEqual({
      kind: 'acted',
      act: { verb: 'added', rows: 1 },
      done: true,
      undoable: false,
    })
  })

  it('leaves a line the snapshot already held as carried', () => {
    const view = browseRowView(SHORTS, runOf(m4Scope(), { hiddenAtSwitch: new Set([SHORTS]) }))

    expect(view.kind).toBe('carried')
  })
})
