/**
 * FR-5.10 — what „Packen abschliessen" decides about each row.
 *
 * The rule the screen must not own, because three things read it: the
 * confirmation (which states what is about to happen), the action (which
 * writes it) and the undo (which puts back exactly the rows that changed).
 *
 * The one clause with a wrong answer is the half-packed row. Four of six
 * socks are in the bag; the skip M4 already has would write quantity 0 and
 * count 0, denying four socks that travelled. P1 (owner, 2026-09-20): the
 * amount shrinks to what is in the bag, so the row reads as packed and the
 * remainder is simply no longer owed.
 */
import { describe, it, expect } from 'vitest'

import { planPackingClose } from '../closePacking'
import type { TripItem } from '@/types/domain'

let seq = 0

function item(over: Partial<TripItem> = {}): TripItem {
  seq += 1
  return {
    id: `i${seq}`,
    trip_id: 't1',
    source_item_id: null,
    source_template_id: null,
    name: `Item ${seq}`,
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
    bought_from: null,
    bought_at: null,
    bought_by_user_id: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '1',
    ...over,
  }
}

const namesOf = (rows: readonly TripItem[]) => rows.map((row) => row.name)

describe('planPackingClose', () => {
  it('skips a row nothing was packed of (FR-5.5)', () => {
    const plan = planPackingClose([item({ name: 'Regenjacke' })])

    expect(namesOf(plan.skip)).toEqual(['Regenjacke'])
    expect(plan.trim).toEqual([])
    expect(namesOf(plan.rows)).toEqual(['Regenjacke'])
  })

  it('shrinks a half-packed row to what is in the bag, never to zero (P1)', () => {
    const socks = item({ name: 'Wandersocken', quantity: 6, packed_count: 4, state: 'partial' })

    const plan = planPackingClose([socks])

    expect(plan.skip).toEqual([])
    expect(namesOf(plan.trim)).toEqual(['Wandersocken'])
    // What the row becomes: the four that travelled, packed. Not a skip —
    // that would deny them.
    expect(plan.trim[0]?.packed_count).toBe(4)
  })

  it('leaves a finished row alone — packed, and already skipped', () => {
    const plan = planPackingClose([
      item({ name: 'Zelt', quantity: 1, packed_count: 1, state: 'packed' }),
      item({ name: 'Drohne', quantity: 0, packed_count: 0, state: 'skipped' }),
      item({ name: 'Stativ', quantity: 3, packed_count: 3, state: 'packed' }),
    ])

    expect(plan.rows).toEqual([])
  })

  it('leaves a skipped row alone even where its amount survived the skip (FR-5.5)', () => {
    // FR-5.5 settled that `state = skipped` beside an amount above zero is a
    // legal row: the merge decides the two fields separately. Closing must
    // read the state, not the numbers, or it would re-skip a decided row and
    // arm an undo for something nobody changed.
    const plan = planPackingClose([
      item({ name: 'Drohne', quantity: 2, packed_count: 0, state: 'skipped' }),
    ])

    expect(plan.rows).toEqual([])
  })

  it('leaves the shopping list alone — a buy row is not packing (FR-30.2)', () => {
    const plan = planPackingClose([
      item({ name: 'Brot', mode: 'buy_before' }),
      item({ name: 'Sonnencreme', mode: 'buy_local' }),
      item({ name: 'Regenjacke', mode: 'pack' }),
    ])

    expect(namesOf(plan.rows)).toEqual(['Regenjacke'])
  })

  it('closes a row somebody is holding, and says so (G-3 is advisory)', () => {
    const held = item({ name: 'Ladegerät', packing_now_by: 'user-sonja', state: 'packing_now' })

    const plan = planPackingClose([held, item({ name: 'Regenjacke' })], {
      isClaimed: (row) => row.id === held.id,
    })

    expect(namesOf(plan.skip)).toEqual(['Ladegerät', 'Regenjacke'])
    expect(plan.claimed).toBe(1)
  })

  it('counts what the confirmation owes the reader: started, late, held', () => {
    const plan = planPackingClose(
      [
        item({ name: 'Wandersocken', quantity: 6, packed_count: 4, state: 'partial' }),
        item({ name: 'Stirnlampe', late_packer: true }),
        item({ name: 'Ladegerät', id: 'held' }),
        item({ name: 'Regenjacke' }),
      ],
      { isClaimed: (row) => row.id === 'held' },
    )

    expect(plan.rows).toHaveLength(4)
    expect(plan.trim).toHaveLength(1)
    expect(plan.late).toBe(1)
    expect(plan.claimed).toBe(1)
  })

  it('has nothing to do on a finished list', () => {
    expect(planPackingClose([]).rows).toEqual([])
    expect(
      planPackingClose([item({ quantity: 1, packed_count: 1, state: 'packed' })]).rows,
    ).toEqual([])
  })
})
