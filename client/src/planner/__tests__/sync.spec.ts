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
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { installHarness, type Harness } from '@/__tests__/harness'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useTripStore } from '@/stores/tripStore'
import type { IdeaPictures, ModuleHost } from '@/sync/featureModule'
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

/**
 * The host with its picture channel recorded. The channel's own two modes
 * are `ideaImages.seam.spec.ts`'s; what is pinned here is what the planner
 * asks of it, and that a move or a delete is an ordinary trip write.
 */
function withPictures(host: ModuleHost) {
  const pictures = {
    add: vi.fn<IdeaPictures['add']>(() => Promise.resolve()),
    url: vi.fn<IdeaPictures['url']>(() => Promise.resolve(null)),
    forget: vi.fn<IdeaPictures['forget']>(() => Promise.resolve()),
  }
  return { host: { ...host, pictures }, pictures }
}

function pulledPicture(id: string, position: number) {
  return {
    seq: 2 + position,
    table: TABLE.ideaImages,
    id,
    deleted: false,
    row: { trip_id: 't1', idea_id: 'idea-1', image_hash: `h-${id}`, position },
  }
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

  /* FR-29.4: an edit writes the words and when, and nothing for a blank or unchanged body. */
  it('edits a word by its body and time alone', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)
    const id = actions.addIdea('t1', GORROPU, 'user-andy')!
    actions.addComment('t1', id, 'Mit Guide', 'user-andy')
    const word = () => plannerStore.getComments('t1')[0]!

    actions.editComment(word(), '  ')
    actions.editComment(word(), 'Mit Guide')
    actions.editComment(word(), 'Nur mit Guide')
    await orch.drainTrip('t1')

    expect(word()).toMatchObject({ body: 'Nur mit Guide' })
    expect(word().edited_at).not.toBeNull()
    const edits = harness
      .pushedMutations()
      .filter((m) => m.table === TABLE.ideaComments && m.op === 'upsert')
    expect(edits).toHaveLength(1)
    expect(Object.keys(edits[0]!.fields ?? {}).sort()).toEqual(['body', 'edited_at'])
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

describe('the day plan (FR-29.14, FR-29.15)', () => {
  /* FR-29.14: a day and a time, written as the fields that change; no day takes the time with it. */
  it('plans an idea on a day and takes the day away again', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)
    const id = actions.addIdea('t1', GORROPU, 'user-andy')!
    const idea = () => plannerStore.getIdea(id)!

    actions.planIdea(idea(), '2026-07-14', '09:00')
    expect(idea()).toMatchObject({ planned_on: '2026-07-14', planned_at: '09:00' })
    actions.planIdea(idea(), '2026-07-14', '09:00')
    actions.planIdea(idea(), null, '09:00')
    expect(idea()).toMatchObject({ planned_on: null, planned_at: null })
    await orch.drainTrip('t1')

    const plans = harness.pushedMutations().filter((m) => m.op === 'upsert')
    expect(plans.map((m) => m.fields)).toEqual([
      { planned_on: '2026-07-14', planned_at: '09:00' },
      { planned_on: null, planned_at: null },
    ])
  })

  it('writes an entry of its own, edits it field by field and deletes it', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)

    expect(
      actions.addDayEntry('t1', '2026-07-14', { title: '  ', note: null, time: null }, null),
    ).toBeNull()
    const id = actions.addDayEntry(
      't1',
      '2026-07-14',
      { title: 'Tisch Su Gologone', note: '4 Personen', time: '19:30' },
      'user-andy',
    )!
    const entry = () => plannerStore.getDayEntry(id)!
    actions.updateDayEntry(entry(), {
      title: 'Tisch Su Gologone',
      note: '4 Personen',
      time: '20:00',
    })
    expect(entry()).toMatchObject({ at_time: '20:00', title: 'Tisch Su Gologone' })
    actions.removeDayEntry(entry())
    expect(plannerStore.getDayEntries('t1')).toEqual([])
    await orch.drainTrip('t1')

    expect(harness.pushedMutations().map((m) => [m.table, m.op, m.fields])).toEqual([
      [
        TABLE.dayEntries,
        'insert',
        {
          trip_id: 't1',
          author_id: 'user-andy',
          on_date: '2026-07-14',
          at_time: '19:30',
          title: 'Tisch Su Gologone',
          note: '4 Personen',
        },
      ],
      [TABLE.dayEntries, 'upsert', { at_time: '20:00' }],
      [TABLE.dayEntries, 'delete', undefined],
    ])
  })

  it('a trip’s tombstone takes its day entries off the device', async () => {
    const orch = serverOrch()
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)
    actions.addDayEntry('t1', '2026-07-14', { title: 'Mietauto', note: null, time: null }, null)

    harness.mockPull([{ seq: 9, table: TABLE.trips, id: 't1', deleted: true, row: null }])
    await orch.drainMaster()

    expect(plannerStore.getDayEntries('t1')).toEqual([])
  })
})

describe('pictures (FR-29.5)', () => {
  it('routes a pulled picture to the planner store', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea, pulledPicture('ii-1', 0)])

    await orch.drainTrip('t1')

    expect(usePlannerStore().getImages('t1')).toEqual([
      { id: 'ii-1', trip_id: 't1', idea_id: 'idea-1', image_hash: 'h-ii-1', position: 0 },
    ])
  })

  it('adds a picture behind the last one, and a fifth not at all', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea, pulledPicture('ii-1', 0), pulledPicture('ii-2', 2)])
    await orch.drainTrip('t1')
    const plannerStore = usePlannerStore()
    const { host, pictures } = withPictures(orch.moduleHost)
    const actions = createPlannerActions(host, plannerStore)
    const source = new Blob(['photo'])

    expect(await actions.addPicture(plannerStore.getIdea('idea-1')!, source)).toBe(true)
    expect(pictures.add).toHaveBeenCalledWith(
      { id: expect.any(String), trip_id: 't1', idea_id: 'idea-1', position: 3 },
      source,
    )

    harness.mockPull([pulledPicture('ii-3', 3), pulledPicture('ii-4', 4)])
    await orch.drainTrip('t1')
    pictures.add.mockClear()
    expect(await actions.addPicture(plannerStore.getIdea('idea-1')!, source)).toBe(false)
    expect(pictures.add).not.toHaveBeenCalled()
  })

  /* FR-29.16: a link's picture comes in the background, and only to an idea without one. */
  it('adds a link’s picture only where the idea still has none when it arrives', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea])
    await orch.drainTrip('t1')
    const plannerStore = usePlannerStore()
    const { host, pictures } = withPictures(orch.moduleHost)
    const actions = createPlannerActions(host, plannerStore)
    const source = new Blob(['from the page'])

    expect(await actions.addLinkPicture('idea-1', source)).toBe(true)
    expect(pictures.add).toHaveBeenCalledTimes(1)

    harness.mockPull([pulledPicture('ii-1', 0)])
    await orch.drainTrip('t1')
    expect(await actions.addLinkPicture('idea-1', source)).toBe(false)
    expect(await actions.addLinkPicture('idea-gone', source)).toBe(false)
    expect(pictures.add).toHaveBeenCalledTimes(1)
  })

  /* FR-29.16: the idea shows its link's picture coming, until it is there — or is not coming after all. */
  it('marks the picture coming while it is awaited, and quietly not when it fails', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea])
    await orch.drainTrip('t1')
    const plannerStore = usePlannerStore()
    const { host, pictures } = withPictures(orch.moduleHost)
    const actions = createPlannerActions(host, plannerStore)

    let deliver: (blob: Blob | null) => void = () => {}
    const waiting = actions.awaitLinkPicture(
      'idea-1',
      new Promise<Blob | null>((resolve) => (deliver = resolve)),
    )
    expect(plannerStore.pictureComing('idea-1')).toBe(true)
    deliver(new Blob(['from the page']))
    await waiting
    expect(plannerStore.pictureComing('idea-1')).toBe(false)
    expect(pictures.add).toHaveBeenCalledTimes(1)

    await actions.awaitLinkPicture('idea-1', Promise.reject(new Error('offline')))
    expect(plannerStore.pictureComing('idea-1')).toBe(false)
  })

  it('makes a picture the cover by moving only what has to move', async () => {
    const orch = serverOrch()
    harness.mockPull([
      pulledIdea,
      pulledPicture('ii-a', 0),
      pulledPicture('ii-b', 1),
      pulledPicture('ii-c', 2),
    ])
    await orch.drainTrip('t1')
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(withPictures(orch.moduleHost).host, plannerStore)

    actions.makeCover(plannerStore.getIdea('idea-1')!, 'ii-b')
    await orch.drainTrip('t1')

    expect(harness.pushedMutations()).toMatchObject([
      { op: 'upsert', table: TABLE.ideaImages, id: 'ii-b', fields: { position: 0 } },
      { op: 'upsert', table: TABLE.ideaImages, id: 'ii-a', fields: { position: 1 } },
    ])
    expect(
      plannerStore
        .getImages('t1')
        .sort((a, b) => a.position - b.position)
        .map((image) => image.id),
    ).toEqual(['ii-b', 'ii-a', 'ii-c'])
  })

  it('removes a picture as a trip write and lets its bytes go', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea, pulledPicture('ii-1', 0)])
    await orch.drainTrip('t1')
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const { host, pictures } = withPictures(orch.moduleHost)

    createPlannerActions(host, plannerStore).removePicture(plannerStore.getImages('t1')[0]!)
    await orch.drainTrip('t1')

    expect(harness.pushedMutations()).toMatchObject([
      { op: 'delete', table: TABLE.ideaImages, id: 'ii-1' },
    ])
    expect(plannerStore.getImages('t1')).toEqual([])
    expect(pictures.forget).toHaveBeenCalledWith(['ii-1'])
  })

  it('a deleted idea takes its pictures with it', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea, pulledPicture('ii-1', 0)])
    await orch.drainTrip('t1')
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const { host, pictures } = withPictures(orch.moduleHost)

    createPlannerActions(host, plannerStore).removeIdea(plannerStore.getIdea('idea-1')!)

    expect(plannerStore.getImages('t1')).toEqual([])
    expect(pictures.forget).toHaveBeenCalledWith(['ii-1'])
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
