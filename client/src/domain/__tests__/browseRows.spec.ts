/**
 * FR-25.13f — the browse sheet lists master items, the trip carries rows.
 * This is the summary that decides which verb a line may offer.
 */
import { describe, expect, it } from 'vitest'

import { browseRowStates } from '../browseRows'
import type { TripItem } from '@/types/domain'

const TRIP = 'trip-1'
const SHORTS = 'item-shorts'
const NEVER_LOCKED = () => null
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
    const states = browseRowStates([row('r1')], NEVER_LOCKED)

    expect(states.get(SHORTS)).toEqual({ state: 'open', itemIds: ['r1'], lockNote: null })
  })

  it('leaves a hand-typed row out — the sheet cannot match it to an inventory line', () => {
    const states = browseRowStates([row('r1', { source_item_id: null })], NEVER_LOCKED)

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
      state: browseRowStates(rows, NEVER_LOCKED).get(SHORTS)?.state,
    }))

    // Compared as a whole rather than asserted per case: a failure then names
    // which of the five disagreed instead of stopping at the first.
    expect(actual).toEqual(cases.map(({ name, state }) => ({ name, state })))
  })

  it('collects a per-person fan-out into one summary, in list order', () => {
    const states = browseRowStates([row('r1'), row('r2'), row('r3')], NEVER_LOCKED)

    expect(states.get(SHORTS)).toEqual({
      state: 'open',
      itemIds: ['r1', 'r2', 'r3'],
      lockNote: null,
    })
  })

  it('locks the whole set when one of its rows is held by somebody else, and says who (G-3)', () => {
    const states = browseRowStates(
      [row('r1'), row('r2', { packing_now_by: 'user-sia' })],
      (item) => (item.packing_now_by === 'user-sia' ? HELD_BY_SIA : null),
    )

    expect(states.get(SHORTS)).toEqual({
      state: 'locked',
      itemIds: ['r1', 'r2'],
      lockNote: HELD_BY_SIA,
    })
  })

  it('lets the lock win over a set that is otherwise settled', () => {
    const states = browseRowStates([row('r1', { state: 'packed' })], () => HELD_BY_SIA)

    expect(states.get(SHORTS)?.state).toBe('locked')
  })

  it('keeps master items apart', () => {
    const states = browseRowStates(
      [row('r1'), row('r2', { source_item_id: 'item-towel', state: 'packed' })],
      NEVER_LOCKED,
    )

    expect(states.get(SHORTS)?.state).toBe('open')
    expect(states.get('item-towel')?.state).toBe('packed')
  })
})
