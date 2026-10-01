/**
 * GPX tracks' files (FR-29.17, FR-31.15), in both modes — the kernel half of
 * `TrackFiles`, for an idea's tracks (which the planner reaches through its
 * `ModuleHost`) and an excursion's alike.
 *
 * Like a picture (`ideaImages.ts`) the file never travels in the envelope
 * and is the trip's (ADR-085, ADR-081's path): Server Mode uploads it with
 * what the device read from it, and the server writes the row. The file is
 * read back only to be downloaded or edited, so nothing here caches it.
 */
import { API } from '@/api/routes'
import type { TrackUpload, PullChange } from '@/api/types'
import type { IdeaTrackPlace, TrackFiles } from '@/sync/featureModule'
import { localChange } from '@/sync/optimistic'
import type { ExcursionTrack, IdeaTrack, TrackFields } from '@/types/domain'
import { TABLE, type SyncTable } from '@/types/tables'
import type { ImageStore } from './images'
import type { RestClient } from './restClient'
import { excursionTrackRow, hashBlob, ideaTrackRow } from './rows'

/** How a track's file is kept on the device in Local Mode. */
export const GPX_TYPE = 'application/gpx+xml'

export interface TrackFileDeps {
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

/** What a track hangs on: its table, its row, and where its file is sent. */
interface TrackHolder<T extends TrackFields & { trip_id: string }> {
  table: SyncTable
  row(track: T): Record<string, unknown>
  url(track: Pick<T, 'id' | 'trip_id'> & Partial<T>): string
}

/** A new track's place before its file is read: the track's own columns that its holder decides. */
type Placed<T> = Omit<T, keyof TrackFields> & Pick<TrackFields, 'id' | 'position'>

/** The row's columns a file decides — everything an upload carries but the file and the travellers' own. */
function fromFile(upload: TrackUpload, gpxHash: string) {
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

function createTrackFiles<T extends TrackFields & { trip_id: string }>(
  deps: TrackFileDeps,
  holder: TrackHolder<T>,
): TrackFiles<T, Placed<T>> {
  const { client, local, applyChanges, drainTrip, whenSent } = deps

  /** Local Mode: the file onto the device, then the row through the funnel. */
  async function keep(track: T, upload: TrackUpload): Promise<void> {
    const blob = new Blob([upload.gpx], { type: GPX_TYPE })
    await local!.putImage(track.id, blob)
    const row = { ...track, ...fromFile(upload, await hashBlob(blob)) }
    applyChanges([localChange(holder.table, track.id, holder.row(row))])
  }

  async function send(track: Pick<T, 'id' | 'trip_id'> & Partial<T>, upload: TrackUpload) {
    await whenSent(track.trip_id)
    await client.put(holder.url(track), upload)
    await drainTrip(track.trip_id)
  }

  return {
    async add(place, upload) {
      const track = {
        ...place,
        name: upload.name,
        kind: upload.kind,
        with_kid: false,
        pause_min: 0,
        ...fromFile(upload, ''),
      } as unknown as T
      if (local) {
        await keep(track, upload)
        return
      }
      await send(track, upload)
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
        return local ? await local.getImage(track.id) : await client.getBlob(holder.url(track))
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

/** FR-29.17: an idea's tracks. */
export function createIdeaTracks(deps: TrackFileDeps): TrackFiles<IdeaTrack, IdeaTrackPlace> {
  return createTrackFiles<IdeaTrack>(deps, {
    table: TABLE.ideaTracks,
    row: ideaTrackRow,
    url: (track) => API.tripIdeaTrack(track.trip_id, track.idea_id!, track.id),
  })
}

/** What an excursion's new track is before its file is read. */
export type ExcursionTrackPlace = Pick<
  ExcursionTrack,
  'id' | 'trip_id' | 'excursion_id' | 'position'
>

/** FR-31.15: an excursion's tracks (ADR-089). */
export function createExcursionTracks(
  deps: TrackFileDeps,
): TrackFiles<ExcursionTrack, ExcursionTrackPlace> {
  return createTrackFiles<ExcursionTrack>(deps, {
    table: TABLE.excursionTracks,
    row: excursionTrackRow,
    url: (track) => API.tripExcursionTrack(track.trip_id, track.excursion_id!, track.id),
  })
}
