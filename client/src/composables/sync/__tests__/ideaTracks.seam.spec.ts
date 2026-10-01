/**
 * FR-29.17 in both modes. A track's file never travels in the sync envelope
 * (ADR-085): Server Mode uploads it with what the device read from it under
 * the track's own id and lets a trip drain bring the row back; Local Mode
 * keeps the file on the device and writes the row itself through the pull
 * funnel.
 */
import { describe, expect, it, vi } from 'vitest'

import { API } from '@/api/routes'
import type { IdeaTrackUpload, PullChange } from '@/api/types'
import type { IdeaTrack } from '@/types/domain'
import { TABLE } from '@/types/tables'
import { createIdeaTracks, GPX_TYPE } from '../ideaTracks'
import type { ImageStore } from '../images'
import { hashBlob } from '../rows'
import { stubClient } from './restClientStub'

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

const PLACE = { id: 'it-1', trip_id: 'trip-1', idea_id: 'idea-1', position: 1 }

const TRACK: IdeaTrack = {
  ...PLACE,
  name: 'Mit Gondel',
  file_name: 'old.gpx',
  kind: 'bike',
  with_kid: true,
  pause_min: 60,
  gpx_hash: 'old',
  distance_m: 1,
  ascent_m: null,
  descent_m: null,
  max_ele_m: null,
  point_count: 2,
  line: 'old',
}

function deviceStore() {
  const files = new Map<string, Blob>()
  return {
    files,
    putImage: vi.fn((id: string, blob: Blob) => {
      files.set(id, blob)
      return Promise.resolve()
    }),
    deleteImage: vi.fn((id: string) => {
      files.delete(id)
      return Promise.resolve()
    }),
    getImage: vi.fn((id: string) => Promise.resolve(files.get(id) ?? null)),
  } satisfies ImageStore & { files: Map<string, Blob> }
}

function tracks(local: ImageStore | null) {
  const client = stubClient()
  const applied: PullChange[] = []
  const drainTrip = vi.fn((_tripId: string) => Promise.resolve())
  const order: string[] = []
  const whenSent = vi.fn((_tripId: string) => {
    order.push('whenSent')
    return Promise.resolve()
  })
  return {
    client,
    applied,
    drainTrip,
    whenSent,
    order,
    files: createIdeaTracks({
      client,
      local,
      applyChanges: (changes) => void applied.push(...changes),
      drainTrip,
      whenSent,
    }),
  }
}

describe('a track in Server Mode', () => {
  it('uploads the file with what was read under the track id, after the trip’s queued writes', async () => {
    const { client, applied, drainTrip, order, files } = tracks(null)
    const put = client.put
    client.put = (...args) => {
      order.push('put')
      return put(...args)
    }
    client.answer(undefined)

    await files.add(PLACE, UPLOAD)

    expect(client.calls).toEqual([
      { verb: 'put', path: API.tripIdeaTrack('trip-1', 'idea-1', 'it-1'), payload: UPLOAD },
    ])
    expect(order).toEqual(['whenSent', 'put'])
    // No optimistic row: the server writes it, and a pull brings it.
    expect(applied).toEqual([])
    expect(drainTrip).toHaveBeenCalledWith('trip-1')
  })

  it('replaces under the same id', async () => {
    const { client, files } = tracks(null)
    client.answer(undefined)

    await files.replace(TRACK, UPLOAD)

    expect(client.paths()).toEqual([API.tripIdeaTrack('trip-1', 'idea-1', 'it-1')])
  })

  it('rejects a failed upload and writes nothing', async () => {
    const { client, applied, drainTrip, files } = tracks(null)
    client.fail(new Error('offline'))

    await expect(files.add(PLACE, UPLOAD)).rejects.toThrow('offline')
    expect(applied).toEqual([])
    expect(drainTrip).not.toHaveBeenCalled()
  })

  it('reads the file back with the member’s session, and answers null when it cannot', async () => {
    const { client, files } = tracks(null)
    const file = new Blob(['<gpx/>'])
    client.answer(file)
    client.fail(new Error('offline'))

    expect(await files.file(TRACK)).toBe(file)
    expect(await files.file(TRACK)).toBeNull()
    expect(client.calls.map((call) => call.verb)).toEqual(['getBlob', 'getBlob'])
  })

  it('has nothing on the device to forget', async () => {
    const { client, files } = tracks(null)
    await files.forget(['it-1'])
    expect(client.calls).toEqual([])
  })
})

describe('a track in Local Mode', () => {
  it('keeps the file on the device and writes the row with its hash, unset settings at their defaults', async () => {
    const device = deviceStore()
    const { client, applied, files } = tracks(device)

    await files.add(PLACE, UPLOAD)

    const kept = device.files.get('it-1')!
    expect(await kept.text()).toBe('<gpx>the file</gpx>')
    expect(kept.type).toBe(GPX_TYPE)
    expect(applied).toEqual([
      {
        seq: expect.any(Number),
        table: TABLE.ideaTracks,
        id: 'it-1',
        deleted: false,
        row: expect.objectContaining({
          trip_id: 'trip-1',
          idea_id: 'idea-1',
          name: 'Rundweg',
          kind: 'hike',
          with_kid: 0,
          pause_min: 0,
          position: 1,
          gpx_hash: await hashBlob(kept),
          distance_m: 7400,
          line: UPLOAD.line,
        }),
      },
    ])
    expect(client.calls).toEqual([])
  })

  it('replaces the file and what was read from it, and keeps what was set', async () => {
    const device = deviceStore()
    const { applied, files } = tracks(device)

    await files.replace(TRACK, UPLOAD)

    expect(applied[0]!.row).toMatchObject({
      name: 'Mit Gondel',
      kind: 'bike',
      with_kid: 1,
      pause_min: 60,
      file_name: 'rundweg.gpx',
      distance_m: 7400,
      line: UPLOAD.line,
    })
  })

  it('reads the kept file back and forgets it', async () => {
    const device = deviceStore()
    const { files } = tracks(device)
    await files.add(PLACE, UPLOAD)

    expect(await (await files.file({ ...TRACK, id: 'it-1' }))!.text()).toBe('<gpx>the file</gpx>')
    await files.forget(['it-1'])
    expect(device.files.size).toBe(0)
  })
})
