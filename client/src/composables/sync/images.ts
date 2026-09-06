/**
 * An item's reference photo (FR-22.1/22.5), in both modes.
 *
 * The bytes never travel in the sync envelope (ADR-002): only
 * `items.image_hash` flows through the master feed, and the image itself
 * moves over its own endpoints — or, in Local Mode, into IndexedDB with a
 * hash computed here. That is the whole reason this is not a mutation like
 * every other master-data write.
 */
import { API } from '@/api/routes'
import { localChange } from '@/sync/optimistic'
import { TABLE } from '@/types/tables'

import { optimizeItemImage } from '@/lib/imageResize'
import type { PullChange } from '@/api/types'
import type { MasterItem } from '@/types/domain'
import { hashBlob, masterItemRow } from './rows'
import type { RestClient } from './restClient'

/** The device's own image store — what Local Mode has instead of the server. */
export interface ImageStore {
  putImage(itemId: string, blob: Blob): Promise<void>
  deleteImage(itemId: string): Promise<void>
  getImage(itemId: string): Promise<Blob | null>
}

export interface ImageDeps {
  client: RestClient
  /** The device's own store in Local Mode, null wherever a server answers. */
  local: ImageStore | null
  /** Where a Server Mode photo is fetched from, for {@link ImageActions.itemImageUrl}. */
  baseUrl: string
  /**
   * The funnel every change passes through — the same one a pull uses, so a
   * Local Mode photo is as durable as a pulled row (FR-19.2).
   */
  applyChanges(changes: PullChange[]): void
  drainMaster(): Promise<void>
  /**
   * The on-device optimizer (FR-22.2/22.3). Injected because it encodes
   * through a canvas, which is the browser's and not a rule of this group:
   * without the seam every case here would need one.
   */
  optimize?: (source: Blob) => Promise<Blob>
}

export interface ImageActions {
  /**
   * Attach or replace an item's photo. The source is optimized on-device
   * first (FR-22.2/22.3), then in Server Mode uploaded (the server stamps
   * `items.image_hash`, which a master drain pulls back) and in Local Mode
   * written to IndexedDB with a locally computed hash.
   */
  setItemImage(item: MasterItem, source: Blob): Promise<void>
  deleteItemImage(item: MasterItem): Promise<void>
  /**
   * A displayable URL for an item's photo, or null when it has none. Server
   * Mode returns the public GET endpoint (with the hash as a cache-buster);
   * Local Mode returns an object URL the caller must revoke. Callers guard
   * on `item.image_hash` to avoid a needless lookup.
   */
  itemImageUrl(item: MasterItem): Promise<string | null>
}

export function createImageActions(deps: ImageDeps): ImageActions {
  const { client, local, baseUrl, applyChanges, drainMaster } = deps
  const optimize = deps.optimize ?? optimizeItemImage

  return {
    async setItemImage(item, source) {
      const optimized = await optimize(source)
      if (local) {
        await local.putImage(item.id, optimized)
        const hash = await hashBlob(optimized)
        applyChanges([
          localChange(TABLE.items, item.id, { ...masterItemRow(item), image_hash: hash }),
        ])
        return
      }
      await client.putRaw(API.itemImage(item.id), optimized, 'image/jpeg')
      await drainMaster()
    },

    async deleteItemImage(item) {
      if (local) {
        await local.deleteImage(item.id)
        applyChanges([
          localChange(TABLE.items, item.id, { ...masterItemRow(item), image_hash: null }),
        ])
        return
      }
      await client.delete(API.itemImage(item.id))
      await drainMaster()
    },

    async itemImageUrl(item) {
      if (!item.image_hash) return null
      if (local) {
        const blob = await local.getImage(item.id)
        return blob ? URL.createObjectURL(blob) : null
      }
      return `${baseUrl}${API.itemImage(item.id)}?v=${item.image_hash}`
    },
  }
}
