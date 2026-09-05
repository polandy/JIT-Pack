/**
 * What `TripReads`/`MasterReads` bought (C-9): a group can be driven by an
 * object literal.
 *
 * Every other seam spec starts pinia and hands the group the real stores —
 * correctly, because it wants to assert against what the group painted. This
 * one exists to hold the *other* property: that the context no longer
 * requires them. Nothing here calls `setActivePinia`, so if `SyncContext`
 * ever widens back to `ReturnType<typeof useTripStore>`, this file stops
 * compiling — and if the fake stops satisfying what a group reads, it fails
 * at runtime with "not a function" rather than quietly passing.
 */
import { describe, it, expect } from 'vitest'
import { createContainerActions } from '../actions/containers'
import { createNameGuards } from '../names'
import type { MasterReads, QueuedMutation, SyncContext, TripReads } from '../context'
import { createMutations } from '@/sync/mutations'
import { HLCGenerator } from '@/sync/hlc'
import type { Container, Template, TripItem } from '@/types/domain'

const TRIP_ID = 'trip-1'
const NOW_ISO = '2026-06-01T09:00:00.000Z'

/** The two containers and one item this file's group reads. */
const LEFT = { id: 'c-left', trip_id: TRIP_ID, name: 'Left Pannier' } as Container
const RIGHT = { id: 'c-right', trip_id: TRIP_ID, name: 'Right Pannier' } as Container
const ITEM = { id: 'i-1', trip_id: TRIP_ID, container_id: LEFT.id } as TripItem

/**
 * A `TripReads` written out by hand — no store, no pinia, no reactivity.
 * The unread members answer with nothing rather than throwing: a group that
 * grew a read this fake cannot serve would fail on the assertion, and a
 * `throw` here would report that as this file's bug.
 */
function fakeTripReads(): TripReads {
  return {
    tripList: [],
    getTrip: () => undefined,
    getItems: (tripId) => (tripId === TRIP_ID ? [ITEM] : []),
    getTravelers: () => [],
    getContainers: (tripId) => (tripId === TRIP_ID ? [LEFT, RIGHT] : []),
    getTodos: () => [],
    getTemplateSources: () => [],
    getGeneratedPositions: () => [],
    childRows: () => [],
    itemChildRows: () => [],
    templateSourceRows: () => [],
  }
}

function fakeMasterReads(templates: Template[] = []): MasterReads {
  return {
    tagList: [],
    itemList: [],
    activeItemList: [],
    templateList: templates,
    activeTemplateList: templates,
    includeList: [],
    dependencyList: [],
    templateItemTaskList: [],
    seriesList: [],
    getItem: () => undefined,
    getItemTags: () => [],
    getTemplate: () => undefined,
    getTemplateItems: () => [],
    getDestinationProfile: () => undefined,
    childRows: () => [],
  }
}

function fakeContext(): { ctx: SyncContext; queued: QueuedMutation[] } {
  const queued: QueuedMutation[] = []
  const masterStore = fakeMasterReads()
  return {
    queued,
    ctx: {
      tripStore: fakeTripReads(),
      masterStore,
      mutations: createMutations(new HLCGenerator(() => 1, 'aabbccdd'), () => NOW_ISO),
      enqueueAndDrain: (_type, _id, ...muts) => queued.push(...muts),
      enqueue: (_type, _id, ...muts) => queued.push(...muts),
      drainPartitions: () => {},
      names: createNameGuards(masterStore),
      local: null,
      today: () => '2026-06-01',
      nowIso: () => NOW_ISO,
      tripDataLoaded: () => true,
    },
  }
}

describe('a sync context built without pinia', () => {
  it('drives a group that reads the trip store', () => {
    const { ctx, queued } = fakeContext()

    createContainerActions(ctx).deleteContainer(TRIP_ID, LEFT.id)

    // Both of this group's reads are exercised: the item is unassigned
    // because `getItems` named it as living in the container, and the delete
    // follows it. Neither is reachable without the fake having answered.
    expect(queued.map((m) => [m.mutation.op, m.mutation.id])).toEqual([
      ['upsert', ITEM.id],
      ['delete', LEFT.id],
    ])
    expect(queued[0]!.mutation.fields!['container_id']).toBeNull()
  })

  it('pairs both sides off the same literal', () => {
    const { ctx, queued } = fakeContext()

    createContainerActions(ctx).pairContainer(TRIP_ID, LEFT.id, RIGHT.id)

    expect(queued.map((m) => m.mutation.id).sort()).toEqual([LEFT.id, RIGHT.id])
    expect(queued.map((m) => m.mutation.fields!['paired_container_id']).sort()).toEqual([
      LEFT.id,
      RIGHT.id,
    ])
  })

  it('answers a name guard off the same literal', () => {
    const held = { id: 't-1', name: 'Ferien' } as Template
    const names = createNameGuards(fakeMasterReads([held]))

    expect(names.templateNameCollision('Ferien')?.id).toBe(held.id)
    expect(names.templateNameCollision('Ferien', held.id)).toBeUndefined()
  })
})
