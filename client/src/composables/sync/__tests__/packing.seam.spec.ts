/**
 * The packing group runs on a context, not on the orchestrator (R-4).
 *
 * It is the group M4 and M5 spend their whole life in, and the one whose
 * rules are easiest to lose in a move: the whole-row optimistic paint, the
 * FR-20.2 co-skip, and the two undos that re-read the row rather than trust
 * the caller's snapshot. Constructed here with a hand-written context — no
 * `fetch`, no WebSocket, no outbox, no orchestrator.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createPackingActions } from '../actions/packing'
import { makeSeamContext, pullIn as seedRow, type Recorded, paintedRow } from './seamContext'
import type { SyncContext } from '../context'
import { TABLE } from '@/types/tables'
import type { TripItem } from '@/types/domain'

const TRIP_ID = 'trip-1'

let queued: Recorded[]
let ctx: SyncContext

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

/** Seeds one trip-partition row the way a pull would. */
function pullIn(table: string, id: string, row: object): void {
  seedRow(ctx.tripStore, table, id, { trip_id: TRIP_ID, ...row })
}

/** One trip row, with values a mapper default could not fabricate. */
function seedTripItem(id: string, fields: Record<string, unknown> = {}): TripItem {
  pullIn(TABLE.tripItems, id, {
    name: `row ${id}`,
    quantity: 3,
    packed_count: 1,
    state: 'open',
    mode: 'pack',
    category_name: 'Kleidung',
    ...fields,
  })
  return ctx.tripStore.getItems(TRIP_ID).find((row) => row.id === id) as TripItem
}

describe('createPackingActions without an orchestrator', () => {
  it('packIncrement queues one write on the trip partition, painting the whole row', () => {
    const item = seedTripItem('ti-1')

    createPackingActions(ctx).packIncrement(TRIP_ID, item)

    expect(queued).toHaveLength(1)
    expect(queued[0]!.type).toBe('trip')
    expect(queued[0]!.id).toBe(TRIP_ID)
    expect(queued[0]!.muts[0]!.mutation.id).toBe('ti-1')
    // The paint carries the fields the mutation does not touch — a builder
    // that forgot one blanks it on every unrelated edit (PR #158).
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      name: 'row ti-1',
      quantity: 3,
      category_name: 'Kleidung',
    })
  })

  it('packComplete packs the whole quantity, packZero takes it all back', () => {
    const item = seedTripItem('ti-1')
    const actions = createPackingActions(ctx)

    actions.packComplete(TRIP_ID, item)
    actions.packZero(TRIP_ID, item)

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ packed_count: 3 })
    expect(queued[1]!.muts[0]!.mutation.fields).toMatchObject({ packed_count: 0 })
  })

  it('restorePack re-reads the row rather than trusting the caller snapshot (FR-25.2)', () => {
    seedTripItem('ti-1', { packed_count: 3, state: 'packed', assigned_traveler_id: 'trav-1' })

    createPackingActions(ctx).restorePack(TRIP_ID, 'ti-1', 1, 'open')

    // The undo restores only what the pack wrote; the traveler that arrived
    // in between is still on the painted row.
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ packed_count: 1, state: 'open' })
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({ assigned_traveler_id: 'trav-1' })
  })

  it('restorePack leaves a row that has since been deleted deleted', () => {
    createPackingActions(ctx).restorePack(TRIP_ID, 'ti-gone', 1, 'open')

    // The positive signal: the queue is the record, and nothing reached it.
    expect(queued).toEqual([])
  })

  it('skipItem takes the required companions with it, main row first (FR-5.5/FR-20.2)', () => {
    const main = seedTripItem('ti-main', { source_item_id: 'item-tent' })
    seedTripItem('ti-comp', { source_item_id: 'item-pegs' })
    seedRow(ctx.masterStore, TABLE.itemDependencies, 'dep-1', {
      item_id: 'item-pegs',
      depends_on_item_id: 'item-tent',
      mode: 'required',
      quantity: 1,
    })

    const affected = createPackingActions(ctx).skipItem(TRIP_ID, main)

    expect(affected.map((row) => row.id)).toEqual(['ti-main', 'ti-comp'])
    expect(queued).toHaveLength(1)
    expect(queued[0]!.muts.map((m) => m.mutation.id)).toEqual(['ti-main', 'ti-comp'])
  })

  it('restoreSkip puts back the rows it still finds and skips the ones that are gone', () => {
    seedTripItem('ti-1', { state: 'skipped', quantity: 0 })

    createPackingActions(ctx).restoreSkip(TRIP_ID, [
      { itemId: 'ti-1', quantity: 3, packedCount: 1, state: 'open' },
      { itemId: 'ti-gone', quantity: 2, packedCount: 0, state: 'open' },
    ])

    expect(queued).toHaveLength(1)
    expect(queued[0]!.muts).toHaveLength(1)
    expect(queued[0]!.muts[0]!.mutation.id).toBe('ti-1')
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ quantity: 3, packed_count: 1 })
  })

  it('restoreSkip queues nothing at all when every row is gone', () => {
    createPackingActions(ctx).restoreSkip(TRIP_ID, [
      { itemId: 'ti-gone', quantity: 2, packedCount: 0, state: 'open' },
    ])

    expect(queued).toEqual([])
  })

  it('buyItem records which of M6’s lists it was checked off (FR-25.11j)', () => {
    const item = seedTripItem('ti-1')
    const actions = createPackingActions(ctx)

    // `buy_before`, not `buy_local`: M6 has two lists, and a case that only
    // ever passes one cannot tell the argument from a constant.
    actions.buyItem(TRIP_ID, item, 'buy_before')
    actions.unbuyItem(TRIP_ID, item, 'buy_before')

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ bought_from: 'buy_before' })
    expect(queued[1]!.muts[0]!.mutation.fields).toMatchObject({ bought_from: null })
  })

  it('setPacker writes the assignment and clears it with null (FR-25.19)', () => {
    const item = seedTripItem('ti-1')
    const actions = createPackingActions(ctx)

    actions.setPacker(TRIP_ID, item, 'user-2')
    actions.setPacker(TRIP_ID, item, null)

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ packer_user_id: 'user-2' })
    expect(queued[1]!.muts[0]!.mutation.fields).toMatchObject({ packer_user_id: null })
  })

  it('setReviewFlag writes one flag and preserves the packing record it judges (FR-9.1)', () => {
    const item = seedTripItem('ti-1', { packed_count: 3, state: 'packed' })

    createPackingActions(ctx).setReviewFlag(TRIP_ID, item, 'unused', true)

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ flag_unused: 1 })
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({ packed_count: 3, state: 'packed' })
  })

  it('quickAddItem pulls the required companions in when it matched a master item (FR-20.4)', () => {
    seedRow(ctx.masterStore, TABLE.items, 'item-tent', { name: 'Zelt', weight_grams: 2000 })
    seedRow(ctx.masterStore, TABLE.items, 'item-pegs', { name: 'Heringe', weight_grams: 300 })
    seedRow(ctx.masterStore, TABLE.itemDependencies, 'dep-1', {
      item_id: 'item-pegs',
      depends_on_item_id: 'item-tent',
      mode: 'required',
      quantity: 1,
    })

    createPackingActions(ctx).quickAddItem(TRIP_ID, 'Zelt', { sourceItemId: 'item-tent' }, true)

    // The add itself, then the companion — the second only because the
    // quick-add matched an inventory row.
    expect(queued).toHaveLength(2)
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ name: 'Zelt', flag_missing: 1 })
    expect(queued[1]!.muts[0]!.mutation.fields).toMatchObject({ source_item_id: 'item-pegs' })
  })

  it('quickAddItem of a typed name resolves nothing — there is no master row to depend on', () => {
    createPackingActions(ctx).quickAddItem(TRIP_ID, 'Sonnencreme', {}, false)

    expect(queued).toHaveLength(1)
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      name: 'Sonnencreme',
      flag_missing: 0,
    })
  })

  it('addDecidedItem packs the new row in the same write that creates it (FR-25.13f)', () => {
    createPackingActions(ctx).addDecidedItem(TRIP_ID, 'Zahnbürste', {}, false, 'packed')

    // One mutation, not an insert followed by a decision: offline, the gap
    // between the two is unbounded and the row sits undecided in it.
    expect(queued).toHaveLength(1)
    expect(queued[0]!.muts).toHaveLength(1)
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      name: 'Zahnbürste',
      quantity: 1,
      packed_count: 1,
      state: 'packed',
    })
    expect(queued[0]!.muts[0]!.mutation.fields!.packed_at).toEqual(expect.any(String))
  })

  it('addDecidedItem writes FR-5.5’s own shape when the decision is to leave it home', () => {
    createPackingActions(ctx).addDecidedItem(TRIP_ID, 'Regenjacke', {}, false, 'skipped')

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      quantity: 0,
      packed_count: 0,
      state: 'skipped',
      packed_at: null,
    })
  })

  it('flags a pack-add on an active trip Missing, and a skip-add never (FR-9.1/FR-25.13f)', () => {
    const actions = createPackingActions(ctx)

    actions.addDecidedItem(TRIP_ID, 'Zahnbürste', {}, true, 'packed')
    actions.addDecidedItem(TRIP_ID, 'Regenjacke', {}, true, 'skipped')

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ flag_missing: 1 })
    // "The plan forgot this" and "we are deliberately not taking it" are
    // opposite statements; M14 would read both and believe the first.
    expect(queued[1]!.muts[0]!.mutation.fields).toMatchObject({ flag_missing: 0 })
  })

  it('pulls companions for a pack-add and none for a skip-add (FR-20.4/FR-25.13f)', () => {
    seedRow(ctx.masterStore, TABLE.items, 'item-tent', { name: 'Zelt', weight_grams: 2000 })
    seedRow(ctx.masterStore, TABLE.items, 'item-pegs', { name: 'Heringe', weight_grams: 300 })
    seedRow(ctx.masterStore, TABLE.itemDependencies, 'dep-1', {
      item_id: 'item-pegs',
      depends_on_item_id: 'item-tent',
      mode: 'required',
      quantity: 1,
    })
    const actions = createPackingActions(ctx)

    actions.addDecidedItem(TRIP_ID, 'Zelt', { sourceItemId: 'item-tent' }, false, 'skipped')
    const afterSkip = queued.length

    actions.addDecidedItem(TRIP_ID, 'Zelt', { sourceItemId: 'item-tent' }, false, 'packed')

    // The spare pegs for a tent that is staying home is the one offer
    // nobody wants; for the packed one it is FR-20.4 as everywhere else.
    expect(afterSkip).toBe(1)
    expect(queued).toHaveLength(3)
    expect(queued[2]!.muts[0]!.mutation.fields).toMatchObject({ source_item_id: 'item-pegs' })
  })

  it('removeAddedItem deletes the row the sheet just added, and leaves a vanished one alone', () => {
    seedTripItem('ti-1')
    const actions = createPackingActions(ctx)

    actions.removeAddedItem(TRIP_ID, 'ti-1')
    const afterDelete = queued.length

    actions.removeAddedItem(TRIP_ID, 'ti-gone')

    expect(afterDelete).toBe(1)
    expect(queued[0]!.muts[0]!.mutation.op).toBe('delete')
    expect(queued[0]!.muts[0]!.mutation.id).toBe('ti-1')
    // A row another device deleted meanwhile is left deleted rather than
    // chased with a second delete.
    expect(queued).toHaveLength(1)
  })

  it('addRequiredCompanions never adds a companion the list already carries (FR-20.3)', () => {
    seedTripItem('ti-main', { source_item_id: 'item-tent' })
    seedTripItem('ti-comp', { source_item_id: 'item-pegs' })
    seedRow(ctx.masterStore, TABLE.items, 'item-tent', { name: 'Zelt' })
    seedRow(ctx.masterStore, TABLE.items, 'item-pegs', { name: 'Heringe' })
    seedRow(ctx.masterStore, TABLE.itemDependencies, 'dep-1', {
      item_id: 'item-pegs',
      depends_on_item_id: 'item-tent',
      mode: 'required',
      quantity: 1,
    })

    createPackingActions(ctx).addRequiredCompanions(TRIP_ID)

    expect(queued).toEqual([])
  })
})
