/**
 * Where the bytes outside the sync envelope go (ADR-002, ARCH-14c): item
 * photos, idea pictures and GPX files. Local Mode keeps them in the device's
 * own store and writes the row itself; a `server` client uploads them and
 * lets a drain bring the row back. The mode picks the implementation once
 * here, so no method of the three groups asks which mode it is in.
 */
import type { IdeaPictures, TrackFiles } from '@/sync/featureModule'
import type { PullChange } from '@/api/types'
import type { ExcursionTrack, IdeaTrack } from '@/types/domain'
import type { IdeaTrackPlace } from '@/sync/featureModule'
import { createLocalIdeaPictures, createServerIdeaPictures } from './ideaImages'
import { createLocalImageActions, createServerImageActions } from './images'
import type { ImageActions, ImageStore } from './images'
import type { RestClient } from './restClient'
import {
  createLocalExcursionTracks,
  createLocalIdeaTracks,
  createServerExcursionTracks,
  createServerIdeaTracks,
  type ExcursionTrackPlace,
} from './trackFiles'

export interface BlobBackend {
  images: ImageActions
  pictures: IdeaPictures
  ideaTracks: TrackFiles<IdeaTrack, IdeaTrackPlace>
  excursionTracks: TrackFiles<ExcursionTrack, ExcursionTrackPlace>
}

export interface BlobBackendDeps {
  /** The device's own store in Local Mode, null wherever a server answers. */
  local: ImageStore | null
  client: RestClient
  baseUrl: string
  /** The funnel every change passes through; Local Mode writes its rows with it. */
  applyChanges(changes: PullChange[]): void
  drainMaster(): Promise<void>
  drainTrip(tripId: string): Promise<void>
  whenSent(tripId: string): Promise<void>
}

export function createBlobBackend(deps: BlobBackendDeps): BlobBackend {
  const { local, client, baseUrl, applyChanges, drainMaster, drainTrip, whenSent } = deps
  if (local) {
    const device = { store: local, applyChanges }
    return {
      images: createLocalImageActions(device),
      pictures: createLocalIdeaPictures(device),
      ideaTracks: createLocalIdeaTracks(device),
      excursionTracks: createLocalExcursionTracks(device),
    }
  }
  const server = { client, drainTrip, whenSent }
  return {
    images: createServerImageActions({ client, baseUrl, drainMaster }),
    pictures: createServerIdeaPictures(server),
    ideaTracks: createServerIdeaTracks(server),
    excursionTracks: createServerExcursionTracks(server),
  }
}
