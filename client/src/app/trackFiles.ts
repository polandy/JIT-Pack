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
import { TABLE, type SyncTable } from '@/api/tables'
import type { ImageStore } from './images'
import type { RestClient } from './restClient'
import { excursionTrackRow, hashBlob, ideaTrackRow } from '@/sync/rows'

/** How a track's file is kept on the device in Local Mode. */
export const GPX_TYPE = 'application/gpx+xml'

export interface LocalTrackFileDeps {
  /**
   * The device's own blob store — the one item photos and idea pictures
   * use, keyed by the track's id.
   */
  store: ImageStore
  /** The funnel a pulled row passes through, for Local Mode's own row. */
  applyChanges(changes: PullChange[]): void
}

export interface ServerTrackFileDeps {
  client: RestClient
  drainTrip(tripId: string): Promise<void>
  /** Resolves once the writes the track stands on have reached the server (see `ServerIdeaPictureDeps`). */
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

/** A track as it is before its file is read: what the holder and the upload decide between them. */
function newTrack<T extends TrackFields & { trip_id: string }>(
  place: Placed<T>,
  upload: TrackUpload,
): T {
  return {
    ...place,
    name: upload.name,
    kind: upload.kind,
    with_kid: false,
    pause_min: 0,
    ...fromFile(upload, ''),
  } as unknown as T
}

/** Local Mode: the file onto the device, then the row through the funnel. */
function localTrackFiles<T extends TrackFields & { trip_id: string }>(
  deps: LocalTrackFileDeps,
  holder: TrackHolder<T>,
): TrackFiles<T, Placed<T>> {
  const { store, applyChanges } = deps

  async function keep(track: T, upload: TrackUpload): Promise<void> {
    const blob = new Blob([upload.gpx], { type: GPX_TYPE })
    await store.putImage(track.id, blob)
    const row = { ...track, ...fromFile(upload, await hashBlob(blob)) }
    applyChanges([localChange(holder.table, track.id, holder.row(row))])
  }

  return {
    add: (place, upload) => keep(newTrack<T>(place, upload), upload),
    replace: (track, upload) => keep(track, upload),

    async file(track) {
      try {
        return await store.getImage(track.id)
      } catch {
        return null
      }
    },

    async forget(trackIds) {
      await Promise.all(trackIds.map((id) => store.deleteImage(id)))
    },
  }
}

/** Server Mode: the upload carries what the device read, and the server writes the row. */
function serverTrackFiles<T extends TrackFields & { trip_id: string }>(
  deps: ServerTrackFileDeps,
  holder: TrackHolder<T>,
): TrackFiles<T, Placed<T>> {
  const { client, drainTrip, whenSent } = deps

  async function send(track: Pick<T, 'id' | 'trip_id'> & Partial<T>, upload: TrackUpload) {
    await whenSent(track.trip_id)
    await client.put(holder.url(track), upload)
    await drainTrip(track.trip_id)
  }

  return {
    add: (place, upload) => send(newTrack<T>(place, upload), upload),
    replace: (track, upload) => send(track, upload),

    async file(track) {
      try {
        return await client.getBlob(holder.url(track))
      } catch {
        return null
      }
    },

    async forget() {},
  }
}

const ideaHolder: TrackHolder<IdeaTrack> = {
  table: TABLE.ideaTracks,
  row: ideaTrackRow,
  url: (track) => API.tripIdeaTrack(track.trip_id, track.idea_id!, track.id),
}

const excursionHolder: TrackHolder<ExcursionTrack> = {
  table: TABLE.excursionTracks,
  row: excursionTrackRow,
  url: (track) => API.tripExcursionTrack(track.trip_id, track.excursion_id!, track.id),
}

/** What an excursion's new track is before its file is read. */
export type ExcursionTrackPlace = Pick<
  ExcursionTrack,
  'id' | 'trip_id' | 'excursion_id' | 'position'
>

/** FR-29.17: an idea's tracks, kept on the device. */
export const createLocalIdeaTracks = (
  deps: LocalTrackFileDeps,
): TrackFiles<IdeaTrack, IdeaTrackPlace> => localTrackFiles(deps, ideaHolder)

/** FR-29.17: an idea's tracks, sent to the server. */
export const createServerIdeaTracks = (
  deps: ServerTrackFileDeps,
): TrackFiles<IdeaTrack, IdeaTrackPlace> => serverTrackFiles(deps, ideaHolder)

/** FR-31.15: an excursion's tracks (ADR-089), kept on the device. */
export const createLocalExcursionTracks = (
  deps: LocalTrackFileDeps,
): TrackFiles<ExcursionTrack, ExcursionTrackPlace> => localTrackFiles(deps, excursionHolder)

/** FR-31.15: an excursion's tracks (ADR-089), sent to the server. */
export const createServerExcursionTracks = (
  deps: ServerTrackFileDeps,
): TrackFiles<ExcursionTrack, ExcursionTrackPlace> => serverTrackFiles(deps, excursionHolder)
