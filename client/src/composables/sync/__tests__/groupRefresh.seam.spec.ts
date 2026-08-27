/**
 * The FR-27.4 refresh runs on a context, not on the orchestrator (R-4).
 *
 * What the diff itself contains is specified in `domain/__tests__/refresh.spec.ts`
 * and what it does to the rows in `composables/__tests__/groupRefresh.spec.ts`.
 * What is asserted here is the seam the move created: the two context fields
 * the group now asks for instead of reading from the closure — `tripDataLoaded`
 * and `today` — the partition each write goes to, and the edge to the comment
 * group that carries FR-27.7's tasks.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createGroupRefreshActions } from '../actions/groupRefresh'
import { createCommentActions } from '../actions/comments'
import { makeSeamContext, pullIn, type Recorded } from './seamContext'
import type { SyncContext } from '../context'
import { TABLE } from '@/types/tables'

const TRIP_ID = 'trip-1'
const GROUP_ID = 'grp-1'
const ITEM_ID = 'item-kamera'
const POSITION_ID = 'pos-1'

/** After SEAM_TODAY, so the trip is still one a group's changes are offered to. */
const TRIP_END = '2026-09-08'

let queued: Recorded[]
let ctx: SyncContext

function build(ctx: SyncContext) {
  return createGroupRefreshActions(ctx, { comments: createCommentActions(ctx) })
}

/**
 * One planning trip following one group that carries one position, seeded the
 * way a pull would so the stores map the rows themselves.
 */
function seedWorld(ctx: SyncContext, opts: { tasks?: boolean; quantity?: number } = {}) {
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
    name: 'Makro Fotografie',
    kind: 'group',
    owner_id: 'u1',
  })
  pullIn(ctx.masterStore, TABLE.items, ITEM_ID, { name: 'Kamera', weight_grams: 780 })
  pullIn(ctx.masterStore, TABLE.templateItems, POSITION_ID, {
    template_id: GROUP_ID,
    item_id: ITEM_ID,
    quantity: opts.quantity ?? 1,
    assignment: 'trip_global',
    dedup: 'max',
    default_mode: 'pack',
    late_packer: 0,
  })
  if (opts.tasks) {
    pullIn(ctx.masterStore, TABLE.templateItemTasks, 'task-1', {
      template_item_id: POSITION_ID,
      task: 'Akku laden',
    })
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

describe('createGroupRefreshActions without an orchestrator', () => {
  it('offers the group’s position and writes nothing until it is answered', () => {
    seedWorld(ctx)

    const plan = build(ctx).proposeTripRefresh(TRIP_ID)

    expect(plan?.add).toHaveLength(1)
    expect(queued).toEqual([])
  })

  it('accepting queues the row on the trip partition and the log on the master one', () => {
    seedWorld(ctx)
    const actions = build(ctx)
    actions.proposeTripRefresh(TRIP_ID)

    actions.acceptTripRefresh(TRIP_ID)

    // P-3: the applied-change log travels the master partition so M2 can
    // render the chip without this trip's own rows being loaded.
    const partitions = new Map(queued.map((q) => [q.muts[0]!.mutation.table, q.type]))
    expect(partitions.get(TABLE.tripItems)).toBe('trip')
    expect(partitions.get(TABLE.tripGeneratedPositions)).toBe('trip')
    expect(partitions.get(TABLE.tripAppliedChanges)).toBe('master')
    expect(actions.refreshProposals.value[TRIP_ID]).toBeUndefined()
  })

  it('carries an FR-27.7 task through the comment group it was handed', () => {
    seedWorld(ctx, { tasks: true })
    const actions = build(ctx)

    actions.acceptTripRefresh(TRIP_ID)

    // The edge is the point: the task becomes an ordinary FR-7.3 prep todo,
    // written by the group that owns todos rather than a second writer here.
    const todo = queued.flatMap((q) => q.muts).find((mut) => mut.mutation.table === TABLE.comments)
    expect(todo?.mutation.fields).toMatchObject({ body: 'Akku laden', is_task: 1 })
  })

  it('asks nothing while the trip’s own rows are not on the device (ADR-016)', () => {
    const { ctx: unloaded, queued: writes } = makeSeamContext({ tripDataLoaded: () => false })
    seedWorld(unloaded)
    const actions = build(unloaded)

    expect(actions.proposeTripRefresh(TRIP_ID)).toBeNull()
    expect(actions.acceptTripRefresh(TRIP_ID)).toBeNull()
    // "Not pulled yet" read as "empty trip" is the one way this feature
    // could duplicate the whole list it exists to keep right.
    expect(writes).toEqual([])
  })

  it('sweeps a trip that has not ended and skips one that has, by the context’s clock', () => {
    seedWorld(ctx)
    const sweeping = build(ctx)

    sweeping.proposeRefreshForLoadedTrips()

    expect(Object.keys(sweeping.refreshProposals.value)).toEqual([TRIP_ID])

    const { ctx: past } = makeSeamContext({ today: '2027-01-01' })
    seedWorld(past)
    const passed = build(past)

    passed.proposeRefreshForLoadedTrips()

    // Same rows, same group, a later clock — FR-27.4 stops offering a trip
    // its groups once the trip is over, and the clock is now the context's
    // rather than the orchestrator's closure.
    expect(Object.keys(passed.refreshProposals.value)).toEqual([])
  })

  it('re-derives on accept rather than replaying the plan it showed', () => {
    seedWorld(ctx, { quantity: 1 })
    const actions = build(ctx)
    actions.proposeTripRefresh(TRIP_ID)

    // The group moved again between the question and the answer.
    pullIn(ctx.masterStore, TABLE.templateItems, POSITION_ID, {
      template_id: GROUP_ID,
      item_id: ITEM_ID,
      quantity: 4,
      assignment: 'trip_global',
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
    })
    actions.acceptTripRefresh(TRIP_ID)

    const row = queued.find((q) => q.muts[0]!.mutation.table === TABLE.tripItems)
    expect(row?.muts[0]!.mutation.fields).toMatchObject({ quantity: 4 })
  })

  it('adopts a row the ledger does not know about instead of asking about it', () => {
    seedWorld(ctx)
    // The position is already on the trip — added by hand, or by a device
    // whose ledger entry never arrived. Nothing is proposed, but the
    // bookkeeping half has to be written or it re-derives on every open.
    pullIn(ctx.tripStore, TABLE.tripItems, 'ti-1', {
      trip_id: TRIP_ID,
      source_item_id: ITEM_ID,
      source_template_id: GROUP_ID,
      name: 'Kamera',
      quantity: 1,
      packed_count: 0,
      state: 'open',
      mode: 'pack',
      weight_grams: 780,
    })
    const actions = build(ctx)

    const plan = actions.proposeTripRefresh(TRIP_ID)

    expect(plan?.add).toEqual([])
    expect(actions.refreshProposals.value[TRIP_ID]).toBeUndefined()
    expect(queued.map((q) => q.muts[0]!.mutation.table)).toEqual([TABLE.tripGeneratedPositions])
  })
})
