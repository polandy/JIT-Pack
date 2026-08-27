/**
 * The post-trip give-back runs on a context and one group edge (R-4).
 *
 * M14's proposals and M21's fold are the only actions here that go the other
 * way round — a trip is the input and master data the output — and neither
 * queues a mutation of its own. What is asserted here is that they compose
 * the master-data group rather than writing beside it, that FR-27.5's order
 * holds (items, then groups, then the Vorlage that references them), and
 * that the two guards that refuse before the first write still refuse.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createPostTripActions } from '../actions/postTrip'
import { createMasterDataActions } from '../actions/masterData'
import { makeSeamContext, pullIn, type Recorded } from './seamContext'
import type { SyncContext } from '../context'
import { TABLE } from '@/types/tables'
import type { ReviewProposal } from '@/domain/review'

const TRIP_ID = 'trip-1'
const GROUP_ID = 'grp-1'
const ITEM_ID = 'item-kamera'

let queued: Recorded[]
let ctx: SyncContext

function build(c: SyncContext) {
  return createPostTripActions(c, { masterData: createMasterDataActions(c) })
}

/** Every write this group makes, as (table, fields) in the order it made them. */
const writes = () =>
  queued.flatMap((q) => q.muts).map((m) => [m.mutation.table, m.mutation.fields] as const)
const tables = () => writes().map(([t]) => t)

function seedGroupWithPosition() {
  pullIn(ctx.masterStore, TABLE.templates, GROUP_ID, {
    name: 'Makro Fotografie',
    kind: 'group',
    owner_id: 'u1',
  })
  pullIn(ctx.masterStore, TABLE.items, ITEM_ID, { name: 'Kamera', weight_grams: 780 })
  pullIn(ctx.masterStore, TABLE.templateItems, 'pos-1', {
    template_id: GROUP_ID,
    item_id: ITEM_ID,
    quantity: 2,
    assignment: 'trip_global',
    dedup: 'max',
    default_mode: 'pack',
    late_packer: 0,
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

describe('applyReviewProposal — FR-9.2, one row at a time', () => {
  it('zeroes the group’s position for an unused proposal, found by item at apply time', () => {
    seedGroupWithPosition()
    const proposal = { kind: 'unused', itemId: ITEM_ID, itemName: 'Kamera' } as ReviewProposal

    expect(build(ctx).applyReviewProposal(proposal, GROUP_ID)).toBe(GROUP_ID)

    // Zeroed, not deleted: FR-9.2 takes the position out of generation
    // without forgetting the group ever carried it.
    expect(writes()).toEqual([[TABLE.templateItems, { quantity: 0 }]])
  })

  it('writes nothing when the position it names is no longer in the group', () => {
    seedGroupWithPosition()
    const proposal = { kind: 'unused', itemId: 'item-gone', itemName: 'Stativ' } as ReviewProposal

    // The proposal may predate an edit that replaced the row — a lookup by
    // item at apply time is what keeps that from writing against nothing.
    expect(build(ctx).applyReviewProposal(proposal, GROUP_ID)).toBe(GROUP_ID)
    expect(queued).toEqual([])
  })

  it('invents the master item a missing proposal names only when it has none', () => {
    seedGroupWithPosition()
    const actions = build(ctx)

    actions.applyReviewProposal(
      { kind: 'missing', itemId: null, itemName: 'Stativ' } as ReviewProposal,
      GROUP_ID,
    )
    const inventedThenAdded = tables()
    queued.length = 0

    actions.applyReviewProposal(
      { kind: 'missing', itemId: ITEM_ID, itemName: 'Kamera' } as ReviewProposal,
      GROUP_ID,
    )

    expect(inventedThenAdded).toEqual([TABLE.items, TABLE.templateItems])
    expect(tables()).toEqual([TABLE.templateItems])
  })
})

describe('createTemplateFromTrip — FR-27.5, the whole trip at once', () => {
  function seedTripWithLooseRow() {
    pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, { name: 'Samedan', year: 2026, status: 'archived' })
    pullIn(ctx.tripStore, TABLE.tripItems, 'ti-1', {
      trip_id: TRIP_ID,
      name: 'Stirnlampe',
      quantity: 1,
      packed_count: 1,
      state: 'packed',
      mode: 'pack',
    })
  }

  it('writes the item, the group and the Vorlage that references it, in that order', () => {
    seedTripWithLooseRow()

    const templateId = build(ctx).createTemplateFromTrip(TRIP_ID, {
      templateName: 'Ferien Engadin',
      choices: {},
      checkedLooseIds: ['ti-1'],
      bundleName: 'Engadin Basis',
    })

    expect(templateId).not.toBeNull()
    // FR-27.5's order is the point: a Vorlage that references a group has to
    // be written after it, and the master item before the position naming it.
    expect(tables()).toEqual([
      TABLE.items,
      TABLE.templates,
      TABLE.templateItems,
      TABLE.templates,
      TABLE.templateIncludes,
    ])
  })

  it('refuses on a colliding name before it writes anything (FR-1.6)', () => {
    seedTripWithLooseRow()
    pullIn(ctx.masterStore, TABLE.templates, 'tpl-taken', {
      name: 'Ferien Engadin',
      kind: 'template',
      owner_id: 'u1',
    })

    const result = build(ctx).createTemplateFromTrip(TRIP_ID, {
      templateName: 'Ferien Engadin',
      choices: {},
      checkedLooseIds: ['ti-1'],
      bundleName: null,
    })

    // Before the first write, not between them: half of M21's work landing
    // before a refused name folds the trip into nothing.
    expect(result).toBeNull()
    expect(queued).toEqual([])
  })

  it('refuses when the bundle would take the Vorlage’s own name', () => {
    seedTripWithLooseRow()

    const result = build(ctx).createTemplateFromTrip(TRIP_ID, {
      templateName: 'Ferien Engadin',
      choices: {},
      checkedLooseIds: ['ti-1'],
      bundleName: '  FERIEN ENGADIN ',
    })

    // Folded comparison, not equality: `foldName` trims and lower-cases, so
    // these two are the same name to every picker that lists them — and the
    // pair would be created in one write, past the collision guard that only
    // looks at names already stored.
    expect(result).toBeNull()
    expect(queued).toEqual([])
  })

  it('refuses while the trip’s own rows are not on the device', () => {
    const { ctx: unloaded, queued: none } = makeSeamContext({ tripDataLoaded: () => false })
    pullIn(unloaded.tripStore, TABLE.trips, TRIP_ID, { name: 'Samedan', year: 2026 })

    // "Not pulled yet" read as "a trip of nothing" would silently produce an
    // empty template.
    expect(
      build(unloaded).createTemplateFromTrip(TRIP_ID, {
        templateName: 'Ferien Engadin',
        choices: {},
        checkedLooseIds: [],
        bundleName: null,
      }),
    ).toBeNull()
    expect(none).toEqual([])
  })
})
