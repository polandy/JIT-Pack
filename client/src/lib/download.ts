/** Browser file-save helpers for exports (M17 data section, FR-18.2/18.3). */

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Save text as a file. Defaults to YAML's registered media type (RFC 9512,
 * 2024) rather than the historical `text/yaml`, so a saved backup carries a
 * type the receiving system recognises — which is what decides whether a
 * mobile file picker offers it back for import.
 */
export function saveText(text: string, filename: string, mime = 'application/yaml'): void {
  saveBlob(new Blob([text], { type: mime }), filename)
}

/** A filesystem-friendly filename stem. */
export function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'export'
}
