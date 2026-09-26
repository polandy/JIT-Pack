/**
 * FR-5.10 — what „Packen abschliessen" decides about each row.
 *
 * The rule the screen must not own, because three things read it: the
 * confirmation (which states what is about to happen), the action (which
 * writes it) and the undo (which puts back exactly the rows that changed).
 *
 * The one clause with a wrong answer is the half-packed row. Four of six
 * socks are in the bag; the skip M4 already has would write quantity 0 and
 * count 0, denying four socks that travelled. P1: the amount shrinks to what
 * is in the bag, so the row reads as packed and the remainder is simply no
 * longer owed.
 */
import { describe, it, expect } from 'vitest'

import {
  packingIsFinished,
  phaseForNewTask,
  planPackingClose,
  rowsCrossingToLocal,
  tasksCrossing,
  type ClosingTask,
} from '../closePacking'
import type { TaskPhase, TripItem } from '@/types/domain'

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

/**
 * FR-5.10's *moment*: when has the packing just been finished?
 *
 * Separate from {@link planPackingClose} because „nothing is left to pack"
 * is not the same question as „what would closing decide", and the first
 * build asked the second one. A trip carrying nothing but shopping rows has
 * an empty plan — there is nothing to decide — and it is emphatically not a
 * trip whose packing was just finished. Asking there put a sheet over M4 on
 * trips nobody had packed anything on, which is what twelve e2e cases then
 * said in the only language CI has.
 */
describe('packingIsFinished', () => {
  it('is true once every packing row is done and at least one was packed', () => {
    expect(
      packingIsFinished([
        item({ quantity: 1, packed_count: 1, state: 'packed' }),
        item({ quantity: 0, packed_count: 0, state: 'skipped' }),
      ]),
    ).toBe(true)
  })

  it('is false while a row is still open or half packed', () => {
    expect(
      packingIsFinished([
        item({ quantity: 1, packed_count: 1, state: 'packed' }),
        item({ name: 'Regenjacke' }),
      ]),
    ).toBe(false)
    expect(packingIsFinished([item({ quantity: 6, packed_count: 4, state: 'partial' })])).toBe(
      false,
    )
  })

  it('is false for a trip that carries no packing row at all', () => {
    // The defect, as a case: buy rows are the shopping list's, so this trip
    // has nothing to pack — and „nothing to pack" is not „finished packing".
    expect(
      packingIsFinished([
        item({ name: 'Brot', mode: 'buy_before' }),
        item({ name: 'Sonnencreme', mode: 'buy_local' }),
      ]),
    ).toBe(false)
    expect(packingIsFinished([])).toBe(false)
  })

  it('is false where every row was decided and none was packed', () => {
    // Skipping the last row is a decision, not a moment of finishing: the
    // question would arrive on the back of the skip's own snackbar.
    expect(
      packingIsFinished([
        item({ quantity: 0, packed_count: 0, state: 'skipped' }),
        item({ quantity: 0, packed_count: 0, state: 'skipped' }),
      ]),
    ).toBe(false)
  })
})

/**
 * FR-7.7's crossing: finishing the packing is the moment „before the trip"
 * ends, so what was still owed before it is now owed during it.
 *
 * The salve is the whole story — a row's preparation that was never done, on
 * a list somebody has just declared finished. What it must *not* touch is as
 * much the point: a task already meant for the road, and a task somebody
 * finished, whose phase is a record of when it was done.
 */
describe('tasksCrossing (FR-7.7): what stops being a task for before the trip', () => {
  const task = (
    id: string,
    over: { phase?: TaskPhase | null; state?: 'open' | 'resolved'; row?: string } = {},
  ) =>
    ({
      id,
      trip_id: 'trip',
      author_id: 'u-andy',
      body: id,
      task_state: over.state ?? 'open',
      phase: over.phase === undefined ? 'before' : over.phase,
      created_at: null,
      assignee_user_id: null,
      resolved_at: null,
      resolved_by_user_id: null,
      ...(over.row ? { trip_item_id: over.row } : {}),
    }) as ClosingTask

  it('takes every open task that was still meant for before the trip, of either kind', () => {
    const crossing = tasksCrossing([task('Salbe holen', { row: 'ti-1' }), task('Pflanzen giessen')])

    expect(crossing.map((t) => t.id)).toEqual(['Salbe holen', 'Pflanzen giessen'])
  })

  it('leaves a task that was already for the road where it is', () => {
    expect(tasksCrossing([task('Zugverbindung abklären', { phase: 'during' })])).toEqual([])
  })

  /*
   * A resolved task's phase says when it *was* done. Moving it would invent a
   * second history for something that already happened.
   */
  it('leaves a finished task alone, whichever phase it was finished in', () => {
    expect(tasksCrossing([task('Akkus laden', { state: 'resolved', row: 'ti-1' })])).toEqual([])
  })

  /*
   * A task written before FR-7.7 carries no phase at all, and reads as one
   * for before the trip (`taskPhaseOf`) — so it crosses like the rest rather
   * than being stranded by a null.
   */
  it('takes a task that never named a phase', () => {
    expect(tasksCrossing([task('Salbe holen', { phase: null })]).map((t) => t.id)).toEqual([
      'Salbe holen',
    ])
  })

  it('is part of the plan, so the question and the write read one rule', () => {
    const plan = planPackingClose([item({ name: 'Regenjacke' })], {
      tasks: [task('Salbe holen'), task('Zugverbindung abklären', { phase: 'during' })],
    })

    expect(plan.tasks.map((t) => t.id)).toEqual(['Salbe holen'])
    expect(plan.rows.map((row) => row.name)).toEqual(['Regenjacke'])
  })
})

describe('FR-7.12: the close ends *before* for the shopping list and for new tasks', () => {
  it('moves only what is still to buy before departure', () => {
    const rows = [
      item({ name: 'Hut', mode: 'buy_before' }),
      item({ name: 'Sonnencreme', mode: 'buy_local' }),
      // Bought before departure: FR-3.3 made it a packing row, and it stays.
      item({ name: 'Kaffee', mode: 'pack', bought_from: 'buy_before' }),
    ]
    expect(namesOf(rowsCrossingToLocal(rows))).toEqual(['Hut'])
    // The plan carries them, so the sheet's sentence and the write read one rule.
    expect(namesOf(planPackingClose(rows).buyRows)).toEqual(['Hut'])
  })

  it.each([
    ['before, while the packing is open', 'before', false, 'before'],
    ['before, once the packing is finished', 'before', true, 'during'],
    ['during, either way', 'during', true, 'during'],
  ] as const)('writes a new task asked for %s', (_name, asked, closed, want) => {
    expect(phaseForNewTask(asked as TaskPhase, closed)).toBe(want)
  })
})
