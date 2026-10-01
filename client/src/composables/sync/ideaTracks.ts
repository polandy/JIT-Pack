/**
 * An idea's GPX tracks (FR-29.17), in both modes — the kernel half of
 * `TrackFiles`, which the planner reaches through its `ModuleHost`.
 *
 * Like a picture (`ideaImages.ts`) the file never travels in the envelope
 * and is the trip's (ADR-085, ADR-081's path): Server Mode uploads it with
 * what the device read from it, and the server writes the row. The file is
 * read back only to be downloaded, so nothing here caches it.
 */
import { API } from '@/api/routes'
import type { IdeaTrackUpload, PullChange } from '@/api/types'
import type { TrackFiles } from '@/sync/featureModule'
import { localChange } from '@/sync/optimistic'
import type { IdeaTrack } from '@/types/domain'
import { TABLE } from '@/types/tables'
import type { ImageStore } from './images'
import type { RestClient } from './restClient'
import { hashBlob, ideaTrackRow } from './rows'

/** How a track's file is kept on the device in Local Mode. */
export const GPX_TYPE = 'application/gpx+xml'

export interface IdeaTrackDeps {
  client: RestClient
  /**
   * The device's own blob store in Local Mode — the one item photos and
   * idea pictures use, keyed by the track's id — null wherever a server
   * answers.
   */
  local: ImageStore | null
  /** The funnel a pulled row passes through, for Local Mode's own row. */
  applyChanges(changes: PullChange[]): void
  drainTrip(tripId: string): Promise<void>
  /** Resolves once the writes the track stands on have reached the server (see `IdeaPictureDeps`). */
  whenSent(tripId: string): Promise<void>
}

/** The row's columns a file decides — everything an upload carries but the file and the travellers' own. */
function fromFile(upload: IdeaTrackUpload, gpxHash: string) {
  return {
    file_name: upload.file_name,
    gpx_hash: gpxHash,
    distance_m: upload.distance_m,
    ascent_m: upload.ascent_m,
    descent_m: upload.descent_m,
    max_ele_m: upload.max_ele_m,
    point_count: upload.point_count,
    line: upload.line,
  }
}

export function createIdeaTracks(deps: IdeaTrackDeps): TrackFiles {
  const { client, local, applyChanges, drainTrip, whenSent } = deps

  /** Local Mode: the file onto the device, then the row through the funnel. */
  async function keep(track: IdeaTrack, upload: IdeaTrackUpload): Promise<void> {
    const blob = new Blob([upload.gpx], { type: GPX_TYPE })
    await local!.putImage(track.id, blob)
    const row: IdeaTrack = { ...track, ...fromFile(upload, await hashBlob(blob)) }
    applyChanges([localChange(TABLE.ideaTracks, track.id, ideaTrackRow(row))])
  }

  async function send(
    track: Pick<IdeaTrack, 'id' | 'trip_id' | 'idea_id'>,
    upload: IdeaTrackUpload,
  ): Promise<void> {
    await whenSent(track.trip_id)
    await client.put(API.tripIdeaTrack(track.trip_id, track.idea_id, track.id), upload)
    await drainTrip(track.trip_id)
  }

  return {
    async add(place, upload) {
      if (local) {
        await keep(
          {
            ...place,
            name: upload.name,
            kind: upload.kind,
            with_kid: false,
            pause_min: 0,
            ...fromFile(upload, ''),
          },
          upload,
        )
        return
      }
      await send(place, upload)
    },

    async replace(track, upload) {
      if (local) {
        await keep(track, upload)
        return
      }
      await send(track, upload)
    },

    async file(track) {
      try {
        return local
          ? await local.getImage(track.id)
          : await client.getBlob(API.tripIdeaTrack(track.trip_id, track.idea_id, track.id))
      } catch {
        return null
      }
    },

    async forget(trackIds) {
      if (!local) return
      await Promise.all(trackIds.map((id) => local.deleteImage(id)))
    },
  }
}
