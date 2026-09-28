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
import { ERROR_CODE, type LinkPreviewRequest, type LinkPreviewResponse } from '@/api/types'
import type { LinkPreviews } from '@/sync/featureModule'
import type { RestClient } from './restClient'

export interface LinkPreviewDeps {
  client: RestClient
  /** Local Mode: no server, so no preview. */
  localMode: boolean
}

export function createLinkPreview(deps: LinkPreviewDeps): LinkPreviews {
  let off = deps.localMode

  async function read(tripId: string, url: string) {
    if (off) return null
    let resp: LinkPreviewResponse
    try {
      resp = await deps.client.post<LinkPreviewResponse>(API.tripLinkPreview(tripId), {
        url,
      } satisfies LinkPreviewRequest)
    } catch (error) {
      if (error instanceof APIRequestError && error.apiError?.code === ERROR_CODE.not_configured) {
        off = true
      }
      return null
    }
    return {
      title: resp.title || null,
      description: resp.description || null,
      picture: resp.image ? pictureOf(resp.image, resp.image_type) : null,
    }
  }

  return { offered: () => !off, read }
}

function pictureOf(base64: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type })
}
