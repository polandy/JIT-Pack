/**
 * A pasted link's preview (FR-29.16) — the kernel half of
 * `ModuleHost.linkPreview`.
 *
 * Only a server can read another site's page: a browser is kept from it by
 * the same-origin rule, so Local Mode has no preview and says so by
 * answering null. An instance whose operator turned previews off answers
 * `not_configured`, and this device stops asking for the session rather
 * than asking at every link.
 */
import { APIRequestError } from '@/api/client'
import { API } from '@/api/routes'
import {
  ERROR_CODE,
  type LinkPreviewImageResponse,
  type LinkPreviewRequest,
  type LinkPreviewResponse,
} from '@/api/types'
import type { LinkPreviews } from '@/sync/featureModule'
import type { RestClient } from './restClient'

export interface LinkPreviewDeps {
  client: RestClient
  /** Local Mode: no server, so no preview. */
  localMode: boolean
}

export function createLinkPreview(deps: LinkPreviewDeps): LinkPreviews {
  let off = deps.localMode

  /** Asks the server, and answers null for anything but an answer. */
  async function ask<T>(path: string, url: string): Promise<T | null> {
    if (off) return null
    try {
      return await deps.client.post<T>(path, { url } satisfies LinkPreviewRequest)
    } catch (error) {
      if (error instanceof APIRequestError && error.apiError?.code === ERROR_CODE.not_configured) {
        off = true
      }
      return null
    }
  }

  return {
    offered: () => !off,
    async read(tripId, url) {
      const resp = await ask<LinkPreviewResponse>(API.tripLinkPreview(tripId), url)
      if (!resp) return null
      return {
        title: resp.title || null,
        description: resp.description || null,
        imageUrl: resp.image_url || null,
      }
    },
    async picture(tripId, imageUrl) {
      const resp = await ask<LinkPreviewImageResponse>(API.tripLinkPreviewImage(tripId), imageUrl)
      return resp?.image ? pictureOf(resp.image, resp.image_type) : null
    },
  }
}

function pictureOf(base64: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type })
}
