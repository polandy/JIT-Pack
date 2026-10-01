/**
 * FR-31.15 (ADR-089): an excursion's GPX tracks through the excursion
 * actions — the file goes to `TrackFiles`, what a person sets is a trip
 * mutation, and the excursion's delete takes its tracks with it.
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TrackUpload } from '@/api/types'
import { MAX_TRACKS } from '@/domain/track'
import { TABLE } from '@/types/tables'
import { createExcursionActions, type ExcursionTrackFiles } from '../actions/excursions'
import { createMasterDataActions } from '../actions/masterData'
import { makeSeamContext, pullIn, type Recorded, type SeamContext } from './seamContext'

const TRIP_ID = 'trip-1'
const EXC_ID = 'exc-1'

const UPLOAD: TrackUpload = {
  name: 'Oeschinensee-Runde',
  file_name: 'runde.gpx',
  kind: 'hike',
  distance_m: 16200,
  ascent_m: 1046,
  descent_m: 1046,
  max_ele_m: 1900,
  point_count: 2,
  line: '_p~iF~ps|U_ulLnnqC',
  gpx: '<gpx/>',
}

let ctx: SeamContext
let queued: Recorded[]
let files: ExcursionTrackFiles & { [K in keyof ExcursionTrackFiles]: ReturnType<typeof vi.fn> }

function build() {
  return createExcursionActions(ctx, { groups: createMasterDataActions(ctx), tracks: files })
}

function seedTrack(id: string, position: number, fields: Record<string, unknown> = {}) {
  pullIn(ctx.tripStore, TABLE.excursionTracks, id, {
    trip_id: TRIP_ID,
    excursion_id: EXC_ID,
    name: `Track ${id}`,
    file_name: `${id}.gpx`,
    kind: 'hike',
    with_kid: 0,
    pause_min: 0,
    position,
    gpx_hash: 'h',
    distance_m: 1000,
    point_count: 2,
    line: 'l',
    ...fields,
  })
}

function excursion() {
  return ctx.tripStore.getExcursions(TRIP_ID)[0]!
}

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
  files = {
    add: vi.fn(() => Promise.resolve()),
    replace: vi.fn(() => Promise.resolve()),
    file: vi.fn(() => Promise.resolve(null)),
    forget: vi.fn(() => Promise.resolve()),
  }
  pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, {
    name: 'Berner Oberland',
    year: 2026,
    status: 'planning',
  })
  pullIn(ctx.tripStore, TABLE.excursions, EXC_ID, { trip_id: TRIP_ID, name: 'Oeschinensee' })
})

describe('excursion tracks — FR-31.15', () => {
  it('adds a track behind the last one, on this excursion', async () => {
    seedTrack('et-a', 0)
    seedTrack('et-b', 3)
    pullIn(ctx.tripStore, TABLE.excursions, 'exc-2', { trip_id: TRIP_ID, name: 'Hüttentour' })
    pullIn(ctx.tripStore, TABLE.excursionTracks, 'et-other', {
      trip_id: TRIP_ID,
      excursion_id: 'exc-2',
      name: 'Elsewhere',
      position: 9,
    })

    const id = await build().addTrack(excursion(), UPLOAD)

    expect(id).toBeTruthy()
    expect(files.add).toHaveBeenCalledWith(
      { id, trip_id: TRIP_ID, excursion_id: EXC_ID, position: 4 },
      UPLOAD,
    )
    expect(
      build()
        .tracksOf(TRIP_ID, EXC_ID)
        .map((track) => track.id),
    ).toEqual(['et-a', 'et-b'])
  })

  it('sends nothing for a sixth track', async () => {
    for (let i = 0; i < MAX_TRACKS; i++) seedTrack(`et-${i}`, i)
    expect(await build().addTrack(excursion(), UPLOAD)).toBeNull()
    expect(files.add).not.toHaveBeenCalled()
  })

  it('writes only the settings that changed, as a trip mutation', () => {
    seedTrack('et-a', 0, { with_kid: 1 })
    const track = ctx.tripStore.getExcursionTracks(TRIP_ID, EXC_ID)[0]!

    build().updateTrack(track, {
      name: '  Mit Gondel ',
      kind: 'hike',
      with_kid: false,
      pause_min: 30,
    })

    const [write] = queued
    expect(write).toMatchObject({ type: 'trip', id: TRIP_ID })
    expect(write!.muts[0]!.mutation).toMatchObject({
      op: 'upsert',
      table: TABLE.excursionTracks,
      id: 'et-a',
      fields: { name: 'Mit Gondel', with_kid: 0, pause_min: 30 },
    })
    expect(ctx.tripStore.getExcursionTracks(TRIP_ID)[0]).toMatchObject({
      name: 'Mit Gondel',
      with_kid: false,
      pause_min: 30,
    })

    queued.length = 0
    build().updateTrack(ctx.tripStore.getExcursionTracks(TRIP_ID)[0]!, { name: ' ', kind: 'hike' })
    expect(queued).toEqual([])
  })

  it('removes a track and drops its file from the device', () => {
    seedTrack('et-a', 0)
    build().removeTrack(ctx.tripStore.getExcursionTracks(TRIP_ID)[0]!)
    expect(queued[0]!.muts[0]!.mutation).toMatchObject({
      op: 'delete',
      table: TABLE.excursionTracks,
    })
    expect(ctx.tripStore.getExcursionTracks(TRIP_ID)).toEqual([])
    expect(files.forget).toHaveBeenCalledWith(['et-a'])
  })

  it('takes the tracks with the excursion, and their files', () => {
    seedTrack('et-a', 0)
    seedTrack('et-b', 1)
    build().deleteExcursion(TRIP_ID, EXC_ID)
    expect(ctx.tripStore.getExcursionTracks(TRIP_ID)).toEqual([])
    expect(files.forget).toHaveBeenCalledWith(['et-a', 'et-b'])
  })

  it('hands a replacement and a download to the files', async () => {
    seedTrack('et-a', 0)
    const track = ctx.tripStore.getExcursionTracks(TRIP_ID)[0]!
    await build().replaceTrack(track, UPLOAD)
    await build().trackFile(track)
    expect(files.replace).toHaveBeenCalledWith(track, UPLOAD)
    expect(files.file).toHaveBeenCalledWith(track)
  })
})
