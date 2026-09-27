/**
 * The planner through the real orchestrator (§3.29, FR-29.9).
 *
 * Like the shopping module, the planner is handed to the orchestrator as a
 * `FeatureStore` and writes through the `ModuleHost`. These cases pin the
 * hand-over — the pull funnel, the write path, the idea's own cascade and
 * the trip's — and the two rules that live in the actions: one vote row per
 * person, and an undo that does not overwrite somebody else's move.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { installHarness, type Harness } from '@/__tests__/harness'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { createPlannerActions, type IdeaFields } from '../actions'
import { voteTally } from '../domain/ideas'
import { plannerFeatureStore, usePlannerStore } from '../store'

let harness: Harness

beforeEach(() => {
  harness = installHarness()
  globalThis.indexedDB = new IDBFactory()
})

function serverOrch() {
  return useSyncOrchestrator({
    baseUrl: 'http://localhost',
    getToken: () => null,
    features: [plannerFeatureStore()],
  })
}

function localOrch(persistence = new IndexedDBPersistence()) {
  return useSyncOrchestrator({
    baseUrl: '',
    getToken: () => null,
    local: persistence,
    features: [plannerFeatureStore()],
  })
}

const GORROPU: IdeaFields = {
  title: 'Schlucht Gola Gorropu',
  note: null,
  link: 'https://gorropu.info',
  tag: 'hiking',
  rainProof: false,
}

const pulledIdea = {
  seq: 1,
  table: TABLE.ideas,
  id: 'idea-1',
  deleted: false,
  row: {
    trip_id: 't1',
    author_id: 'user-sia',
    title: 'Museo Nivola',
    state: 'idea',
    rain_proof: 1,
  },
}

describe('Server Mode', () => {
  it('routes a pulled idea to the planner store, and to it alone', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea])

    await orch.drainTrip('t1')

    expect(usePlannerStore().getIdeas('t1')).toMatchObject([
      { id: 'idea-1', title: 'Museo Nivola', rain_proof: true, author_id: 'user-sia' },
    ])
    expect(useTripStore().getTripComments('t1')).toEqual([])
  })

  it('pushes a new idea on the trip’s partition, with my id standing in for the stamp', async () => {
    const orch = serverOrch()
    harness.mockDrain()

    createPlannerActions(orch.moduleHost, usePlannerStore()).addIdea('t1', GORROPU, 'user-andy')
    await orch.drainTrip('t1')

    expect(harness.pushedMutations()).toMatchObject([
      {
        op: 'insert',
        table: TABLE.ideas,
        fields: {
          trip_id: 't1',
          author_id: 'user-andy',
          title: 'Schlucht Gola Gorropu',
          link: 'https://gorropu.info',
          tag: 'hiking',
          rain_proof: 0,
          state: 'idea',
        },
      },
    ])
  })

  /*
   * FR-29.3: a vote is one row per person and idea. Withdrawing keeps the
   * row, so casting again updates it instead of asking the server for a
   * second one, which the UNIQUE constraint would refuse.
   */
  it('casts, withdraws and casts again on one row (FR-29.3)', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)
    const id = actions.addIdea('t1', GORROPU, 'user-andy')!
    const tally = () => voteTally(id, plannerStore.getVotes('t1'), 'user-andy')

    actions.vote('t1', id, tally(), 'up', 'user-andy')
    expect(tally()).toMatchObject({ up: ['user-andy'], mine: 'up' })
    actions.vote('t1', id, tally(), null, 'user-andy')
    expect(tally()).toMatchObject({ up: [], mine: null })
    actions.vote('t1', id, tally(), 'down', 'user-andy')
    expect(tally()).toMatchObject({ down: ['user-andy'], mine: 'down' })
    await orch.drainTrip('t1')

    const votes = harness.pushedMutations().filter((m) => m.table === TABLE.ideaVotes)
    expect(votes.map((m) => m.op)).toEqual(['insert', 'upsert', 'upsert'])
    expect(new Set(votes.map((m) => m.id)).size).toBe(1)
    expect(plannerStore.getVotes('t1')).toHaveLength(1)
  })

  it('writes an edit field by field, so it overwrites nobody else’s', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)
    const id = actions.addIdea('t1', GORROPU, 'user-andy')!

    actions.updateIdea(plannerStore.getIdea(id)!, { ...GORROPU, rainProof: true, note: '  ' })
    await orch.drainTrip('t1')

    expect(harness.pushedMutations()[1]).toMatchObject({ op: 'upsert', fields: { rain_proof: 1 } })
    expect(Object.keys(harness.pushedMutations()[1]!.fields ?? {})).toEqual(['rain_proof'])
  })

  /* FR-29.2: an undo gives the old state back only while nobody has moved the idea since. */
  it('undoes a move, but not over a later one', () => {
    const orch = serverOrch()
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)
    const id = actions.addIdea('t1', GORROPU, 'user-andy')!

    const undo = actions.setState(plannerStore.getIdea(id)!, 'shortlisted')
    undo()
    expect(plannerStore.getIdea(id)?.state).toBe('idea')

    const stale = actions.setState(plannerStore.getIdea(id)!, 'shortlisted')
    actions.setState(plannerStore.getIdea(id)!, 'done')
    stale()
    expect(plannerStore.getIdea(id)?.state).toBe('done')
  })

  it('a trip’s tombstone takes its ideas, votes and words off the device', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)
    const id = actions.addIdea('t1', GORROPU, 'user-andy')!
    actions.vote('t1', id, voteTally(id, [], 'user-andy'), 'up', 'user-andy')
    actions.addComment('t1', id, 'Nur mit Guide', 'user-andy')

    harness.mockPull([{ seq: 9, table: TABLE.trips, id: 't1', deleted: true, row: null }])
    await orch.drainMaster()

    expect([
      plannerStore.getIdeas('t1'),
      plannerStore.getVotes('t1'),
      plannerStore.getComments('t1'),
    ]).toEqual([[], [], []])
  })
})

describe('Local Mode', () => {
  it('an idea with its vote and its words survives a restart', async () => {
    const persistence = new IndexedDBPersistence()
    const first = localOrch(persistence)
    await first.connect()
    const actions = createPlannerActions(first.moduleHost, usePlannerStore())
    const id = actions.addIdea('t1', GORROPU, null)!
    actions.addComment('t1', id, 'Festes Schuhwerk', null)
    await persistence.whenSettled()

    setActivePinia(createPinia())
    await localOrch(new IndexedDBPersistence()).connect()

    const plannerStore = usePlannerStore()
    expect(plannerStore.getIdeas('t1').map((idea) => idea.title)).toEqual(['Schlucht Gola Gorropu'])
    expect(plannerStore.getComments('t1').map((comment) => comment.body)).toEqual([
      'Festes Schuhwerk',
    ])
  })

  /*
   * FR-29.2: Local Mode has no server to cascade, and the disk deletes only
   * the keys it is handed — so the idea's delete names its votes and words.
   */
  it('deleting an idea takes its votes and words off the disk (C-3a)', async () => {
    const persistence = new IndexedDBPersistence()
    const orch = localOrch(persistence)
    await orch.connect()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)
    const id = actions.addIdea('t1', GORROPU, null)!
    actions.vote('t1', id, voteTally(id, [], null), 'up', null)
    actions.addComment('t1', id, 'Festes Schuhwerk', null)
    await persistence.whenSettled()

    actions.removeIdea(plannerStore.getIdea(id)!)
    await persistence.whenSettled()

    expect((await persistence.load()).map((row) => row.table)).toEqual([])
    expect([
      plannerStore.getIdeas('t1'),
      plannerStore.getVotes('t1'),
      plannerStore.getComments('t1'),
    ]).toEqual([[], [], []])
  })

  it('a deleted trip takes its ideas off the device (C-3a)', async () => {
    const persistence = new IndexedDBPersistence()
    await persistence.save([
      {
        seq: 0,
        table: TABLE.trips,
        id: 't1',
        deleted: false,
        row: { name: 'Engadin', year: 2026 },
      },
      { ...pulledIdea, seq: 0 },
    ])

    const orch = localOrch(persistence)
    await orch.connect()
    orch.deleteTrip('t1')
    await persistence.whenSettled()

    expect((await persistence.load()).map((r) => `${r.table}/${r.id}`)).toEqual([])
    expect(usePlannerStore().getIdeas('t1')).toEqual([])
  })
})
