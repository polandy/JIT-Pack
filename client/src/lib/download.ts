/** Browser file-save helpers for exports (M17 data section, FR-18.2/18.3). */

import { PORTABLE_MEDIA_TYPE } from '@/domain/portable'

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Save text as a file. Defaults to the portable document's media type, which
 * is what decides whether a mobile file picker offers the file back for import.
 */
export function saveText(text: string, filename: string, mime = PORTABLE_MEDIA_TYPE): void {
  saveBlob(new Blob([text], { type: mime }), filename)
}

/** A filesystem-friendly filename stem. */
export function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'export'
}
