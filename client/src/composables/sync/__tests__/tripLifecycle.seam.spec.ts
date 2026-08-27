/**
 * The trip's own life runs on a context and three named group edges (R-4).
 *
 * What each action does to the rows is specified in
 * `composables/__tests__/tripProperties.spec.ts` and `groupToTrip.spec.ts`.
 * What is asserted here is the seam: that each edge is actually wired and not
 * a dead parameter, that the two partitions stay apart, and that the guards
 * a store is reachable past — a trip that is not loaded, a trip that has
 * already started — still hold with no orchestrator around them.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createTripLifecycleActions } from '../actions/tripLifecycle'
import { createCommentActions } from '../actions/comments'
import { createPackingActions } from '../actions/packing'
import { createGroupRefreshActions } from '../actions/groupRefresh'
import { makeSeamContext, pullIn, type Recorded } from './seamContext'
import type { SyncContext } from '../context'
import { TABLE } from '@/types/tables'
import { TRIP_STATUS_ACTIVE, TRIP_STATUS_ARCHIVED } from '@/types/domain'

const TRIP_ID = 'trip-1'
const GROUP_ID = 'grp-1'
const ITEM_ID = 'item-kamera'
const TRAVELER_ID = 'trav-1'

/** After the seam context's clock, so the trip still follows its groups. */
const TRIP_END = '2026-09-08'

let queued: Recorded[]
let ctx: SyncContext

function build(ctx: SyncContext) {
  const comments = createCommentActions(ctx)
  return createTripLifecycleActions(ctx, {
    comments,
    packing: createPackingActions(ctx),
    groupRefresh: createGroupRefreshActions(ctx, { comments }),
  })
}

function seedTrip(status = 'planning') {
  pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, {
    name: 'Samedan',
    year: 2026,
    status,
    end_date: TRIP_END,
  })
}

/** One group carrying one position, with an FR-27.7 task on it. */
function seedGroup() {
  pullIn(ctx.masterStore, TABLE.templates, GROUP_ID, {
    name: 'Makro Fotografie',
    kind: 'group',
    owner_id: 'u1',
  })
  pullIn(ctx.masterStore, TABLE.items, ITEM_ID, { name: 'Kamera', weight_grams: 780 })
  pullIn(ctx.masterStore, TABLE.templateItems, 'pos-1', {
    template_id: GROUP_ID,
    item_id: ITEM_ID,
    quantity: 1,
    assignment: 'trip_global',
    dedup: 'max',
    default_mode: 'pack',
    late_packer: 0,
  })
  pullIn(ctx.masterStore, TABLE.templateItemTasks, 'task-1', {
    template_item_id: 'pos-1',
    task: 'Akku laden',
  })
}

const tablesQueued = () => queued.flatMap((q) => q.muts).map((m) => m.mutation.table)

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

describe('createTripLifecycleActions without an orchestrator', () => {
  it('updateTrip writes the whole row on the master partition', () => {
    seedTrip()

    build(ctx).updateTrip(TRIP_ID, { name: 'Samedan Winter' })

    expect(queued).toHaveLength(1)
    expect(queued[0]!.type).toBe('master')
    // The paint is the row plus the edit — a field the builder forgot is
    // blanked on every unrelated edit, and no pull comes to fix it in
    // Local Mode (PR #158).
    expect(queued[0]!.muts[0]!.optimistic?.row).toMatchObject({
      name: 'Samedan Winter',
      year: 2026,
    })
  })

  it('addGroupToTrip writes the row, the FR-27.7 task and the source registration', () => {
    seedTrip()
    seedGroup()

    const report = build(ctx).addGroupToTrip(TRIP_ID, GROUP_ID)

    expect(report).toMatchObject({ groupName: 'Makro Fotografie', added: 1 })
    // Each of the three is a different edge: the row is this group's own
    // write, the todo goes through the comment group, and the registration
    // is the master-partition half (P-3).
    expect(tablesQueued()).toContain(TABLE.tripItems)
    expect(tablesQueued()).toContain(TABLE.comments)
    const source = queued.find((q) => q.muts[0]!.mutation.table === TABLE.tripTemplateSources)
    expect(source?.type).toBe('master')
  })

  it('addGroupToTrip refuses while the trip’s own rows are not on the device', () => {
    const { ctx: unloaded, queued: writes } = makeSeamContext({ tripDataLoaded: () => false })
    pullIn(unloaded.tripStore, TABLE.trips, TRIP_ID, { name: 'Samedan', year: 2026 })
    pullIn(unloaded.masterStore, TABLE.templates, GROUP_ID, {
      name: 'Makro Fotografie',
      kind: 'group',
      owner_id: 'u1',
    })

    expect(build(unloaded).addGroupToTrip(TRIP_ID, GROUP_ID)).toBeNull()
    expect(writes).toEqual([])
  })

  it('adding a traveller lets the plan follow through the refresh group', () => {
    seedTrip()
    seedGroup()
    pullIn(ctx.tripStore, TABLE.tripTemplateSources, 'src-1', {
      trip_id: TRIP_ID,
      template_id: GROUP_ID,
    })

    const report = build(ctx).addTravelerToTrip(TRIP_ID, 'Andrea')

    // The roster write is this group's; the rows that follow are FR-27.4's,
    // reached through the edge rather than expanded a second way here.
    expect(tablesQueued()).toContain(TABLE.travelers)
    expect(tablesQueued()).toContain(TABLE.tripItems)
    expect(report?.added).toBe(1)
  })

  it('removing a traveller detaches their packed row through the packing group', () => {
    seedTrip()
    pullIn(ctx.tripStore, TABLE.travelers, TRAVELER_ID, { trip_id: TRIP_ID, name: 'Andrea' })
    pullIn(ctx.tripStore, TABLE.tripItems, 'ti-1', {
      trip_id: TRIP_ID,
      name: 'Kamera',
      quantity: 1,
      packed_count: 1,
      state: 'packed',
      mode: 'pack',
      assigned_traveler_id: TRAVELER_ID,
    })

    build(ctx).removeTraveler(TRIP_ID, TRAVELER_ID)

    // Default, not `includePacked`: the row stays and loses its assignment,
    // which is the packing group's write, not a delete.
    const detach = queued.find((q) => q.muts[0]!.mutation.table === TABLE.tripItems)
    expect(detach?.muts[0]!.mutation.fields).toMatchObject({ assigned_traveler_id: null })
    expect(detach?.muts[0]!.mutation.op).not.toBe('delete')
  })

  it('removeTraveler refuses once the trip has started (FR-2.7)', () => {
    seedTrip('active')
    pullIn(ctx.tripStore, TABLE.travelers, TRAVELER_ID, { trip_id: TRIP_ID, name: 'Andrea' })

    // The control is disabled on a started trip; this is the second line,
    // and it exists because a store is reachable from more than one screen.
    expect(build(ctx).removeTraveler(TRIP_ID, TRAVELER_ID)).toBeNull()
    expect(queued).toEqual([])
  })

  it('the status trio names the trip’s own vocabulary', () => {
    seedTrip()
    const actions = build(ctx)

    actions.activateTrip(TRIP_ID)
    actions.archiveTrip(TRIP_ID)

    expect(queued.map((q) => q.muts[0]!.mutation.fields?.status)).toEqual([
      TRIP_STATUS_ACTIVE,
      TRIP_STATUS_ARCHIVED,
    ])
    expect(queued.every((q) => q.type === 'master')).toBe(true)
  })

  it('deleteTrip tombstones on the master partition', () => {
    seedTrip()

    build(ctx).deleteTrip(TRIP_ID)

    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.muts[0]!.optimistic?.deleted).toBe(true)
  })
})
