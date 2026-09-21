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
import {
  changesOf,
  makeSeamContext,
  pullIn as seedRow,
  type Recorded,
  paintedRow,
  type SeamContext,
} from './seamContext'
import { TABLE } from '@/types/tables'
import type { TripItem } from '@/types/domain'

const TRIP_ID = 'trip-1'

let queued: Recorded[]
let ctx: SeamContext

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

  it('skipItem on one traveler’s row leaves the companion for the other (FR-20.2, FR-25.1)', () => {
    const mine = seedTripItem('ti-tent-a', {
      source_item_id: 'item-tent',
      assigned_traveler_id: 'trav-a',
    })
    seedTripItem('ti-tent-b', { source_item_id: 'item-tent', assigned_traveler_id: 'trav-b' })
    seedTripItem('ti-comp', { source_item_id: 'item-pegs' })
    seedRow(ctx.masterStore, TABLE.itemDependencies, 'dep-1', {
      item_id: 'item-pegs',
      depends_on_item_id: 'item-tent',
      mode: 'required',
      quantity: 1,
    })

    const affected = createPackingActions(ctx).skipItem(TRIP_ID, mine)

    // The skip itself lands — the queue is the positive signal — and it is
    // the only row written: the other traveler's tent still needs the pegs.
    expect(affected.map((row) => row.id)).toEqual(['ti-tent-a'])
    expect(queued[0]!.muts.map((m) => m.mutation.id)).toEqual(['ti-tent-a'])
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

  it('setLatePackerForRows writes the flag on every row it is handed (FR-25.26)', () => {
    const rows = [seedTripItem('ti-1'), seedTripItem('ti-2'), seedTripItem('ti-3')]

    createPackingActions(ctx).setLatePackerForRows(TRIP_ID, rows, true)

    // One write per instance, not one write that a merge would have to
    // spread: field-level LWW (NFR-4.2a) merges the three exactly as it
    // merges three separate row-level edits, which is the point of the
    // fan-out rather than a new shape.
    expect(queued).toHaveLength(3)
    expect(queued.map((write) => write.muts[0]!.mutation.id)).toEqual(['ti-1', 'ti-2', 'ti-3'])
    for (const write of queued) {
      expect(write.muts[0]!.mutation.fields).toMatchObject({ late_packer: 1 })
    }
  })

  it('setPackerForRows hands every row to the same person, and takes them all back (FR-25.26)', () => {
    const rows = [seedTripItem('ti-1'), seedTripItem('ti-2')]
    const actions = createPackingActions(ctx)

    actions.setPackerForRows(TRIP_ID, rows, 'user-2')
    actions.setPackerForRows(TRIP_ID, rows, null)

    expect(queued.map((write) => write.muts[0]!.mutation.fields)).toMatchObject([
      { packer_user_id: 'user-2' },
      { packer_user_id: 'user-2' },
      { packer_user_id: null },
      { packer_user_id: null },
    ])
  })

  it('writes nothing at all when the fan-out was handed no rows', () => {
    createPackingActions(ctx).setLatePackerForRows(TRIP_ID, [], true)

    expect(queued).toHaveLength(0)
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
    // The whole row the companion states, not only which item it is: it
    // carries the inventory row's facts, and claims no template, packs, and
    // is no late packer because nobody chose otherwise for it (C-13).
    expect(queued[1]!.muts[0]!.mutation.fields).toMatchObject({
      source_item_id: 'item-pegs',
      source_template_id: null,
      name: 'Heringe',
      weight_grams: 300,
      quantity: 1,
      mode: 'pack',
      late_packer: 0,
    })
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

  it('a forgotten-add is a row that stayed home, flagged Missing, on an active trip (FR-5.11/FR-9.1)', () => {
    const actions = createPackingActions(ctx)

    actions.addDecidedItem(TRIP_ID, 'Sonnencreme', {}, true, 'forgotten')

    // Not packed and not open: it neither inflates the packing progress nor
    // becomes a job on the list, and M14 reads the flag for the next trip.
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      name: 'Sonnencreme',
      state: 'skipped',
      quantity: 0,
      packed_count: 0,
      packed_at: null,
      flag_missing: 1,
    })
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

  it('planRowRemoval counts the notes that cascade and names the companions (FR-5.8)', () => {
    const main = seedTripItem('ti-main', { source_item_id: 'item-tent', packed_count: 0 })
    seedTripItem('ti-comp', { source_item_id: 'item-pegs' })
    seedRow(ctx.masterStore, TABLE.itemDependencies, 'dep-1', {
      item_id: 'item-pegs',
      depends_on_item_id: 'item-tent',
      mode: 'required',
      quantity: 1,
    })
    pullIn(TABLE.comments, 'cm-1', { trip_item_id: 'ti-main', author_id: 'u', body: 'Wo?' })
    pullIn(TABLE.comments, 'td-1', {
      trip_item_id: 'ti-main',
      author_id: 'u',
      body: 'Imprägnieren',
      is_task: 1,
      task_state: 'open',
    })
    // A trip-level comment hangs off no row, so the removal does not take it.
    pullIn(TABLE.comments, 'cm-trip', { trip_item_id: null, author_id: 'u', body: 'Los!' })

    const plan = createPackingActions(ctx).planRowRemoval(TRIP_ID, main)

    expect(plan.notes).toBe(2)
    expect(plan.packed).toBe(0)
    expect(plan.companions.map((row) => row.id)).toEqual(['ti-comp'])
  })

  it('removeItem deletes the row with its notes and co-skips its companions in one write (FR-5.8)', () => {
    const main = seedTripItem('ti-main', { source_item_id: 'item-tent' })
    const comp = seedTripItem('ti-comp', { source_item_id: 'item-pegs' })
    pullIn(TABLE.comments, 'cm-1', { trip_item_id: 'ti-main', author_id: 'u', body: 'Wo?' })

    createPackingActions(ctx).removeItem(TRIP_ID, main, [comp])

    expect(queued).toHaveLength(1)
    const [removal, skip] = queued[0]!.muts
    expect(removal!.mutation).toMatchObject({ op: 'delete', id: 'ti-main' })
    // The comment goes from the device in the same paint — Local Mode has no
    // server to cascade it (C-3a).
    expect(changesOf(removal!).map((c) => [c.id, c.deleted])).toEqual([
      ['cm-1', true],
      ['ti-main', true],
    ])
    expect(skip!.mutation).toMatchObject({ id: 'ti-comp', fields: { state: 'skipped' } })
  })

  it('removing one traveler’s instance of a per-person item leaves the other’s alone (FR-5.8, FR-25.21)', () => {
    // Both instances packed, as when one person packed the item for both: the
    // removal forgets only the unit on the row it was asked about.
    const shared = { source_item_id: 'item-underwear', name: 'Unterhose', quantity: 1 }
    seedTripItem('ti-a', {
      ...shared,
      assigned_traveler_id: 'trav-a',
      packed_count: 1,
      state: 'packed',
    })
    const theirs = seedTripItem('ti-b', {
      ...shared,
      assigned_traveler_id: 'trav-b',
      packed_count: 1,
      state: 'packed',
    })
    const actions = createPackingActions(ctx)

    const plan = actions.planRowRemoval(TRIP_ID, theirs)
    actions.removeItem(TRIP_ID, theirs, plan.companions)

    // A sibling instance is not a companion, so nothing else is skipped…
    expect(plan).toMatchObject({ packed: 1, companions: [] })
    expect(queued).toHaveLength(1)
    expect(queued[0]!.muts.map((m) => [m.mutation.op, m.mutation.id])).toEqual([['delete', 'ti-b']])
    // …and the other traveler's row is still there, packed.
    expect(ctx.tripStore.getItems(TRIP_ID)).toEqual([
      expect.objectContaining({ id: 'ti-a', assigned_traveler_id: 'trav-a', packed_count: 1 }),
    ])
  })

  it('restoreRemovedItem re-inserts the row under its own id, with its decisions (FR-5.8)', () => {
    const row = seedTripItem('ti-1', {
      source_item_id: 'item-tent',
      source_template_id: 'tpl-1',
      packed_count: 0,
      late_packer: 1,
      assigned_traveler_id: 'trav-1',
      packer_user_id: 'user-2',
      container_id: 'box-1',
    })
    const actions = createPackingActions(ctx)
    actions.removeItem(TRIP_ID, row, [])

    actions.restoreRemovedItem(TRIP_ID, row)

    const restore = queued[1]!.muts[0]!
    // The same id, so the FR-27.4 ledger entry pointing at it finds its row
    // again and a group refresh does not add a second one.
    expect(restore.mutation).toMatchObject({ op: 'insert', id: 'ti-1' })
    expect(restore.mutation.fields).toMatchObject({
      trip_id: TRIP_ID,
      name: 'row ti-1',
      source_item_id: 'item-tent',
      source_template_id: 'tpl-1',
      quantity: 3,
      state: 'open',
      late_packer: 1,
      assigned_traveler_id: 'trav-1',
      packer_user_id: 'user-2',
      container_id: 'box-1',
    })
    // Never the server's stamps: invariant 3 strips them anyway, and a client
    // that sends them is claiming an identity.
    expect(restore.mutation.fields).not.toHaveProperty('packed_by_user_id')
    expect(restore.mutation.fields).not.toHaveProperty('packing_now_by')
  })

  it('restoreRemovedItem leaves alone a row that is back already', () => {
    const row = seedTripItem('ti-1')
    const actions = createPackingActions(ctx)

    actions.restoreRemovedItem(TRIP_ID, row)

    // The positive signal: the queue is the record, and nothing reached it —
    // the row was never removed, so there is nothing to put back.
    expect(queued).toEqual([])
  })

  it('skipRows skips exactly the rows named, in one enqueue, and deletes nothing (FR-25.31)', () => {
    const a = seedTripItem('ti-a')
    const b = seedTripItem('ti-b')
    seedTripItem('ti-main')
    const actions = createPackingActions(ctx)

    actions.skipRows(TRIP_ID, [a, b])

    // One unit, like the removal it is half of: the confirmed removal skips
    // the companions now and deletes its own row only when the undo lapses.
    expect(queued).toHaveLength(1)
    const muts = queued[0]!.muts.map((m) => m.mutation)
    expect(muts.map((m) => m.id)).toEqual(['ti-a', 'ti-b'])
    for (const m of muts) expect(m).toMatchObject({ op: 'upsert', fields: { state: 'skipped' } })
  })

  it('skipRows writes nothing for no rows', () => {
    createPackingActions(ctx).skipRows(TRIP_ID, [])
    expect(queued).toEqual([])
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
