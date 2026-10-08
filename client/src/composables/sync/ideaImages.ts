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
import { hashBlob, ideaImageRow } from './rows'

const JPEG = 'image/jpeg'

export interface IdeaPictureDeps {
  client: RestClient
  /** The device's own store in Local Mode, null wherever a server answers. */
  local: ImageStore | null
  /** The funnel a pulled row passes through, for Local Mode's own row. */
  applyChanges(changes: PullChange[]): void
  drainTrip(tripId: string): Promise<void>
  /**
   * Resolves once the writes the picture stands on — the trip's, and the
   * master partition's that create the trip itself — have reached the
   * server, and rejects when they cannot: the server refuses a picture for
   * an idea it does not have.
   */
  whenSent(tripId: string): Promise<void>
  /** The on-device scaler — injected because it encodes through a canvas. */
  optimize?: (source: Blob) => Promise<Blob>
  /** Object URLs are the browser's; injected so a spec can see them made. */
  objectUrl?: (blob: Blob) => string
}

export function createIdeaPictures(deps: IdeaPictureDeps): IdeaPictures {
  const { client, local, applyChanges, drainTrip, whenSent } = deps
  const optimize =
    deps.optimize ?? ((source: Blob) => optimizeItemImage(source, IDEA_IMAGE_OPTIONS))
  const objectUrl = deps.objectUrl ?? ((blob: Blob) => URL.createObjectURL(blob))
  // One URL per picture and hash for the session: a board and its detail
  // show the same picture, and a second fetch would be a second download.
  // The hash is in the key because a picture's bytes never change under its
  // id — a new hash can only be a restored backup's.
  const urls = new Map<string, Promise<string | null>>()

  async function load(image: IdeaImage): Promise<string | null> {
    const blob = local
      ? await local.getImage(image.id)
      : await client.getBlob(API.tripIdeaImage(image.trip_id, image.idea_id, image.id))
    return blob ? objectUrl(blob) : null
  }

  return {
    async add(image, source) {
      const optimized = await optimize(source)
      if (local) {
        await local.putImage(image.id, optimized)
        const row: IdeaImage = { ...image, image_hash: await hashBlob(optimized) }
        applyChanges([localChange(TABLE.ideaImages, image.id, ideaImageRow(row))])
        return
      }
      await whenSent(image.trip_id)
      await client.putRaw(
        API.tripIdeaImage(image.trip_id, image.idea_id, image.id),
        optimized,
        JPEG,
      )
      await drainTrip(image.trip_id)
    },

    url(image) {
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
    },

    async forget(imageIds) {
      if (!local) return
      await Promise.all(imageIds.map((id) => local.deleteImage(id)))
    },
  }
}
