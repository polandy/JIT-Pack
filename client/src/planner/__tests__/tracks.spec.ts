/**
 * An idea's GPX tracks through the real orchestrator (FR-29.17).
 *
 * The file channel's two modes are `ideaTracks.seam.spec.ts`'s; what is
 * pinned here is what the planner asks of it — a track behind the last one,
 * never a sixth — and that a setting, a removal and an idea's delete are
 * ordinary trip writes.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { installHarness, type Harness } from '@/__tests__/harness'
import type { IdeaTrackUpload } from '@/api/types'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import type { ModuleHost, TrackFiles } from '@/sync/featureModule'
import { TABLE } from '@/types/tables'
import { createPlannerActions, type IdeaFields } from '../actions'
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

const UPLOAD: IdeaTrackUpload = {
  name: 'Rundweg',
  file_name: 'rundweg.gpx',
  kind: 'hike',
  distance_m: 7400,
  ascent_m: 520,
  descent_m: 510,
  max_ele_m: 1752,
  point_count: 2,
  line: '_p~iF~ps|U_ulLnnqC',
  gpx: '<gpx>the file</gpx>',
}

const pulledIdea = {
  seq: 1,
  table: TABLE.ideas,
  id: 'idea-1',
  deleted: false,
  row: {
    trip_id: 't1',
    author_id: 'user-sia',
    title: 'Oeschinensee',
    state: 'idea',
    rain_proof: 0,
  },
}

function pulledTrack(id: string, position: number, row: Record<string, unknown> = {}) {
  return {
    seq: 10 + position,
    table: TABLE.ideaTracks,
    id,
    deleted: false,
    row: {
      trip_id: 't1',
      idea_id: 'idea-1',
      name: `Track ${id}`,
      file_name: `${id}.gpx`,
      kind: 'hike',
      with_kid: 0,
      pause_min: 0,
      position,
      gpx_hash: `h-${id}`,
      distance_m: 7400,
      ascent_m: 520,
      descent_m: 510,
      max_ele_m: 1752,
      point_count: 120,
      line: '_p~iF~ps|U_ulLnnqC',
      ...row,
    },
  }
}

/** The host with its file channel recorded. */
function withTracks(host: ModuleHost) {
  const tracks = {
    add: vi.fn<TrackFiles['add']>(() => Promise.resolve()),
    replace: vi.fn<TrackFiles['replace']>(() => Promise.resolve()),
    file: vi.fn<TrackFiles['file']>(() => Promise.resolve(null)),
    forget: vi.fn<TrackFiles['forget']>(() => Promise.resolve()),
  }
  return { host: { ...host, tracks }, tracks }
}

describe('Server Mode', () => {
  it('routes a pulled track to the planner store, a file without heights without them', async () => {
    const orch = serverOrch()
    harness.mockPull([
      pulledIdea,
      pulledTrack('it-1', 0, { with_kid: 1, kind: 'bike' }),
      pulledTrack('it-2', 1, { ascent_m: null, descent_m: null, max_ele_m: null }),
    ])

    await orch.drainTrip('t1')

    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)
    expect(actions.tracksOf(plannerStore.getIdea('idea-1')!)).toMatchObject([
      { id: 'it-1', kind: 'bike', with_kid: true, ascent_m: 520 },
      { id: 'it-2', kind: 'hike', with_kid: false, ascent_m: null, max_ele_m: null },
    ])
  })

  it('adds a track behind the last one, and never a sixth', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea, pulledTrack('it-a', 0), pulledTrack('it-b', 3)])
    await orch.drainTrip('t1')
    const plannerStore = usePlannerStore()
    const { host, tracks } = withTracks(orch.moduleHost)
    const actions = createPlannerActions(host, plannerStore)
    const idea = plannerStore.getIdea('idea-1')!

    const id = await actions.addTrack(idea, UPLOAD)

    expect(tracks.add).toHaveBeenCalledWith(
      { id, trip_id: 't1', idea_id: 'idea-1', position: 4 },
      UPLOAD,
    )

    harness.mockPull([pulledTrack('it-c', 4), pulledTrack('it-d', 5), pulledTrack('it-e', 6)])
    await orch.drainTrip('t1')
    expect(await actions.addTrack(idea, UPLOAD)).toBeNull()
    expect(tracks.add).toHaveBeenCalledTimes(1)
  })

  it('writes only the settings that changed, as a trip write', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea, pulledTrack('it-1', 0)])
    await orch.drainTrip('t1')
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)
    const track = plannerStore.getTracks('t1')[0]!

    actions.updateTrack(track, { name: '  ', kind: 'hike', with_kid: true, pause_min: 15 })
    await orch.drainTrip('t1')

    expect(harness.pushedMutations()).toMatchObject([
      { op: 'upsert', table: TABLE.ideaTracks, id: 'it-1', fields: { with_kid: 1, pause_min: 15 } },
    ])
    expect(Object.keys(harness.pushedMutations()[0]!.fields ?? {}).sort()).toEqual([
      'pause_min',
      'with_kid',
    ])
    expect(plannerStore.getTracks('t1')[0]).toMatchObject({
      with_kid: true,
      pause_min: 15,
      line: track.line,
    })
  })

  it('writes nothing for a change that is none', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea, pulledTrack('it-1', 0)])
    await orch.drainTrip('t1')
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const actions = createPlannerActions(orch.moduleHost, plannerStore)

    actions.updateTrack(plannerStore.getTracks('t1')[0]!, { name: 'Track it-1', pause_min: 0 })
    await orch.drainTrip('t1')

    expect(harness.pushedMutations()).toEqual([])
  })

  it('removes a track as a trip write and lets its file go', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea, pulledTrack('it-1', 0)])
    await orch.drainTrip('t1')
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const { host, tracks } = withTracks(orch.moduleHost)

    createPlannerActions(host, plannerStore).removeTrack(plannerStore.getTracks('t1')[0]!)
    await orch.drainTrip('t1')

    expect(harness.pushedMutations()).toMatchObject([
      { op: 'delete', table: TABLE.ideaTracks, id: 'it-1' },
    ])
    expect(plannerStore.getTracks('t1')).toEqual([])
    expect(tracks.forget).toHaveBeenCalledWith(['it-1'])
  })

  it('a deleted idea takes its tracks with it', async () => {
    const orch = serverOrch()
    harness.mockPull([pulledIdea, pulledTrack('it-1', 0)])
    await orch.drainTrip('t1')
    harness.mockDrain()
    const plannerStore = usePlannerStore()
    const { host, tracks } = withTracks(orch.moduleHost)

    createPlannerActions(host, plannerStore).removeIdea(plannerStore.getIdea('idea-1')!)

    expect(plannerStore.getTracks('t1')).toEqual([])
    expect(tracks.forget).toHaveBeenCalledWith(['it-1'])
  })
})

describe('Local Mode', () => {
  const OESCHINEN: IdeaFields = {
    title: 'Oeschinensee',
    note: null,
    link: null,
    tag: 'hiking',
    rainProof: false,
  }

  it('a track and its file survive a restart, and go with their idea (C-3a)', async () => {
    const persistence = new IndexedDBPersistence()
    const first = localOrch(persistence)
    await first.connect()
    const actions = createPlannerActions(first.moduleHost, usePlannerStore())
    const ideaId = actions.addIdea('t1', OESCHINEN, null)!
    const trackId = (await actions.addTrack(usePlannerStore().getIdea(ideaId)!, UPLOAD))!
    actions.updateTrack(usePlannerStore().getTracks('t1')[0]!, { pause_min: 30 })
    await persistence.whenSettled()

    setActivePinia(createPinia())
    const second = localOrch(new IndexedDBPersistence())
    await second.connect()
    const plannerStore = usePlannerStore()
    const again = createPlannerActions(second.moduleHost, plannerStore)
    const [track] = plannerStore.getTracks('t1')
    expect(track).toMatchObject({ id: trackId, name: 'Rundweg', pause_min: 30, distance_m: 7400 })
    expect(await (await again.trackFile(track!))!.text()).toBe('<gpx>the file</gpx>')

    again.removeIdea(plannerStore.getIdea(ideaId)!)
    await persistence.whenSettled()
    expect(plannerStore.getTracks('t1')).toEqual([])
  })
})
