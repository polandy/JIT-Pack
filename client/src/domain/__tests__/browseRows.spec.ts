/**
 * FR-25.13f — the browse sheet lists master items, the trip carries rows.
 * This is the summary that decides which verb a line may offer.
 */
import { describe, expect, it } from 'vitest'

import { browseRowStates } from '../browseRows'
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
