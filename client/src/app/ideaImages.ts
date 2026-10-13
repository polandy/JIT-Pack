/**
 * An idea's pictures (FR-29.5), in both modes — the kernel half of
 * `IdeaPictures`, which the planner reaches through its `ModuleHost`.
 *
 * Like an item photo (`images.ts`) the bytes never travel in the envelope
 * (ADR-002). Unlike one they are the trip's and sit behind its membership,
 * so a Server Mode picture cannot be an `<img src>`: the request needs the
 * bearer token, and the bytes come back as a blob this device shows through
 * an object URL.
 */
import { API } from '@/api/routes'
import type { PullChange } from '@/api/types'
import { IDEA_IMAGE_OPTIONS, optimizeItemImage } from '@/lib/imageResize'
import type { IdeaPictures } from '@/sync/featureModule'
import { localChange } from '@/sync/optimistic'
import type { IdeaImage } from '@/types/domain'
import { TABLE } from '@/api/tables'
import type { ImageStore } from './images'
import type { RestClient } from './restClient'
import { hashBlob, ideaImageRow } from '@/sync/rows'

const JPEG = 'image/jpeg'

interface IdeaPictureDepsBase {
  /** The on-device scaler — injected because it encodes through a canvas. */
  optimize?: (source: Blob) => Promise<Blob>
  /** Object URLs are the browser's; injected so a spec can see them made. */
  objectUrl?: (blob: Blob) => string
}

export interface LocalIdeaPictureDeps extends IdeaPictureDepsBase {
  /** The device's own store — what Local Mode has instead of the server. */
  store: ImageStore
  /** The funnel a pulled row passes through, for Local Mode's own row. */
  applyChanges(changes: PullChange[]): void
}

export interface ServerIdeaPictureDeps extends IdeaPictureDepsBase {
  client: RestClient
  drainTrip(tripId: string): Promise<void>
  /**
   * Resolves once the writes the picture stands on — the trip's, and the
   * master partition's that create the trip itself — have reached the
   * server, and rejects when they cannot: the server refuses a picture for
   * an idea it does not have.
   */
  whenSent(tripId: string): Promise<void>
}

/**
 * One URL per picture and hash for the session: a board and its detail show
 * the same picture, and a second fetch would be a second download. The hash
 * is in the key because a picture's bytes never change under its id — a new
 * hash can only be a restored backup's.
 */
function cachedUrl(
  read: (image: IdeaImage) => Promise<Blob | null>,
  objectUrl: (blob: Blob) => string,
): IdeaPictures['url'] {
  const urls = new Map<string, Promise<string | null>>()
  const load = async (image: IdeaImage) => {
    const blob = await read(image)
    return blob ? objectUrl(blob) : null
  }
  return (image) => {
    const key = `${image.id}:${image.image_hash}`
    let url = urls.get(key)
    if (!url) {
      // A failed read is not remembered: offline now is online later.
      url = load(image).catch(() => {
        urls.delete(key)
        return null
      })
      urls.set(key, url)
    }
    return url
  }
}

const scaler = (deps: IdeaPictureDepsBase) =>
  deps.optimize ?? ((source: Blob) => optimizeItemImage(source, IDEA_IMAGE_OPTIONS))
const urlMaker = (deps: IdeaPictureDepsBase) =>
  deps.objectUrl ?? ((blob: Blob) => URL.createObjectURL(blob))

/** Local Mode: the picture goes into IndexedDB and its row is written through the funnel. */
export function createLocalIdeaPictures(deps: LocalIdeaPictureDeps): IdeaPictures {
  const { store, applyChanges } = deps
  const optimize = scaler(deps)

  return {
    async add(image, source) {
      const optimized = await optimize(source)
      await store.putImage(image.id, optimized)
      const row: IdeaImage = { ...image, image_hash: await hashBlob(optimized) }
      applyChanges([localChange(TABLE.ideaImages, image.id, ideaImageRow(row))])
    },

    url: cachedUrl((image) => store.getImage(image.id), urlMaker(deps)),

    async forget(imageIds) {
      await Promise.all(imageIds.map((id) => store.deleteImage(id)))
    },
  }
}

/** Server Mode: the picture is uploaded once its idea has reached the server; the server deletes its own. */
export function createServerIdeaPictures(deps: ServerIdeaPictureDeps): IdeaPictures {
  const { client, drainTrip, whenSent } = deps
  const optimize = scaler(deps)

  return {
    async add(image, source) {
      const optimized = await optimize(source)
      await whenSent(image.trip_id)
      await client.putRaw(
        API.tripIdeaImage(image.trip_id, image.idea_id, image.id),
        optimized,
        JPEG,
      )
      await drainTrip(image.trip_id)
    },

    url: cachedUrl(
      (image) => client.getBlob(API.tripIdeaImage(image.trip_id, image.idea_id, image.id)),
      urlMaker(deps),
    ),

    async forget() {},
  }
}
