/**
 * FR-27.16 on a context: what taking an inventory name over writes, and that
 * it leaves the row following its group (FR-27.4) rather than detaching it.
 *
 * Which names differ is specified in `domain/__tests__/inventoryNames.spec.ts`.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createGroupRefreshActions } from '../actions/groupRefresh'
import { createInventoryNameActions } from '../actions/inventoryNames'
import { createCommentActions } from '../actions/comments'
import { makeSeamContext, pullIn, type Recorded, type SeamContext } from './seamContext'
import { TABLE } from '@/types/tables'
import type { TripItem } from '@/types/domain'

const TRIP_ID = 'trip-1'
const GROUP_ID = 'grp-1'
const ITEM_ID = 'item-kamera'
const POSITION_ID = 'pos-1'
const TRIP_END = '2026-09-08'
const NEW_NAME = 'Kamera (Vollformat)'

let queued: Recorded[]
let ctx: SeamContext

function build(ctx: SeamContext) {
  const groupRefresh = createGroupRefreshActions(ctx, { comments: createCommentActions(ctx) })
  return { groupRefresh, names: createInventoryNameActions(ctx, { groupRefresh }) }
}

function position(quantity: number) {
  pullIn(ctx.masterStore, TABLE.templateItems, POSITION_ID, {
    template_id: GROUP_ID,
    item_id: ITEM_ID,
    quantity,
    assignment: 'trip_global',
    dedup: 'max',
    default_mode: 'pack',
    late_packer: 0,
  })
}

/** A trip generated from one group, so its one row has a ledger entry. */
function seedGeneratedTrip(actions: ReturnType<typeof build>): TripItem {
  pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, {
    name: 'Samedan',
    year: 2026,
    status: 'planning',
    end_date: TRIP_END,
  })
  pullIn(ctx.tripStore, TABLE.tripTemplateSources, 'src-1', {
    trip_id: TRIP_ID,
    template_id: GROUP_ID,
  })
  pullIn(ctx.masterStore, TABLE.templates, GROUP_ID, {
    name: 'Fotografie',
    kind: 'group',
    owner_id: 'u1',
  })
  pullIn(ctx.masterStore, TABLE.items, ITEM_ID, { name: 'Kamera' })
  position(1)
  actions.groupRefresh.acceptTripRefresh(TRIP_ID)
  return onlyRow()
}

function onlyRow(): TripItem {
  const rows = ctx.tripStore.getItems(TRIP_ID)
  expect(rows).toHaveLength(1)
  return rows[0]!
}

/** Rewrites the row the way a pull would, with `packed_count` changed. */
function setPacked(row: TripItem, packed: number) {
  pullIn(ctx.tripStore, TABLE.tripItems, row.id, {
    trip_id: row.trip_id,
    source_item_id: row.source_item_id,
    source_template_id: row.source_template_id,
    name: row.name,
    quantity: row.quantity,
    packed_count: packed,
    state: packed >= row.quantity ? 'packed' : 'open',
    mode: row.mode,
    late_packer: 0,
  })
}

function renameInInventory(name: string) {
  pullIn(ctx.masterStore, TABLE.items, ITEM_ID, { name })
}

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

describe('createInventoryNameActions (FR-27.16)', () => {
  it('offers the rename FR-27.4 leaves alone on a packed row, and adopting writes the row and the ledger', () => {
    const actions = build(ctx)
    const row = seedGeneratedTrip(actions)
    setPacked(row, 1)
    renameInInventory(NEW_NAME)
    // Packing protects the row from the group: nothing is asked there.
    expect(actions.groupRefresh.proposeTripRefresh(TRIP_ID)?.update).toEqual([])
    queued.length = 0

    const renames = actions.names.inventoryRenamesOf(TRIP_ID)
    expect(renames.map((r) => r.to)).toEqual([NEW_NAME])
    actions.names.adoptInventoryNames(TRIP_ID, renames)

    expect(onlyRow().name).toBe(NEW_NAME)
    expect(ctx.tripStore.getGeneratedPositions(TRIP_ID).map((e) => e.name)).toEqual([NEW_NAME])
    expect(queued.map((q) => [q.type, q.muts[0]!.mutation.table])).toEqual([
      ['trip', TABLE.tripItems],
      ['trip', TABLE.tripGeneratedPositions],
    ])
    expect(actions.names.inventoryRenamesOf(TRIP_ID)).toEqual([])
  })

  it('leaves the row following its group: a later group change is still offered to it', () => {
    const actions = build(ctx)
    const row = seedGeneratedTrip(actions)
    setPacked(row, 1)
    renameInInventory(NEW_NAME)
    actions.names.adoptInventoryNames(TRIP_ID, actions.names.inventoryRenamesOf(TRIP_ID))

    // Unpacked again and the group raises the amount: had the ledger kept
    // the old name, the row would read as hand-renamed and be skipped here.
    setPacked(onlyRow(), 0)
    position(3)
    const plan = actions.groupRefresh.proposeTripRefresh(TRIP_ID)

    expect(plan?.update.map((u) => u.fields)).toEqual([{ quantity: 3 }])
  })

  it('does not offer a rename the group card is already asking about', () => {
    const actions = build(ctx)
    seedGeneratedTrip(actions)
    renameInInventory(NEW_NAME)
    const plan = actions.groupRefresh.proposeTripRefresh(TRIP_ID)
    expect(plan?.update.map((u) => u.fields)).toEqual([{ name: NEW_NAME }])

    expect(actions.names.inventoryRenamesOf(TRIP_ID)).toEqual([])
  })

  it('the undo puts the old name and the old ledger entry back', () => {
    const actions = build(ctx)
    const row = seedGeneratedTrip(actions)
    setPacked(row, 1)
    renameInInventory(NEW_NAME)
    const undo = actions.names.adoptInventoryNames(
      TRIP_ID,
      actions.names.inventoryRenamesOf(TRIP_ID),
    )

    actions.names.restoreInventoryNames(TRIP_ID, undo)

    expect(onlyRow().name).toBe('Kamera')
    expect(ctx.tripStore.getGeneratedPositions(TRIP_ID).map((e) => e.name)).toEqual(['Kamera'])
    expect(actions.names.inventoryRenamesOf(TRIP_ID).map((r) => r.to)).toEqual([NEW_NAME])
  })

  it('offers nothing while the trip’s rows are not on the device', () => {
    let loaded = false
    const { ctx: unloaded } = makeSeamContext({ tripDataLoaded: () => loaded })
    const groupRefresh = createGroupRefreshActions(unloaded, {
      comments: createCommentActions(unloaded),
    })
    const names = createInventoryNameActions(unloaded, { groupRefresh })
    pullIn(unloaded.masterStore, TABLE.items, ITEM_ID, { name: NEW_NAME })
    pullIn(unloaded.tripStore, TABLE.tripItems, 'ti-1', {
      trip_id: TRIP_ID,
      source_item_id: ITEM_ID,
      name: 'Kamera',
      quantity: 1,
      packed_count: 0,
      state: 'open',
      mode: 'pack',
      late_packer: 0,
    })

    expect(names.inventoryRenamesOf(TRIP_ID)).toEqual([])
    // The same rows, once the trip counts as loaded: the empty answer above
    // was the guard, not a world with nothing to offer.
    loaded = true
    expect(names.inventoryRenamesOf(TRIP_ID)).toHaveLength(1)
  })
})
