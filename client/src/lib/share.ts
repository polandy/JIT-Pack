/**
 * Handing a portable document to the device's share sheet (FR-18.2).
 *
 * The export already writes the same document to a file; sharing it saves the
 * detour through the file manager on a phone, which is where a Vorlage is
 * usually passed on (a message to a friend running their own instance).
 */

/**
 * The media type and extension a shared document travels under. Not the
 * portable file's own `application/yaml`: Chrome shares only an allowlist of
 * file types, YAML is not on it, and a file it refuses makes `canShare` false
 * on exactly the platform the action is for. Plain text is on every list, and
 * the import picker accepts it already (`PORTABLE_FILE_ACCEPT`). The `.yaml`
 * before the extension keeps the name saying what the file is.
 */
export const SHARE_MEDIA_TYPE = 'text/plain'
export const SHARE_EXTENSION = '.yaml.txt'

/** What became of a share: sent, dismissed by the person, or not possible. */
export type ShareOutcome = 'shared' | 'cancelled' | 'failed'

/** The file a document is shared as. */
export function shareableFile(text: string, stem: string): File {
  return new File([text], `${stem}${SHARE_EXTENSION}`, { type: SHARE_MEDIA_TYPE })
}

/**
 * Whether this browser can share the file at all. The action is offered only
 * when it can (G-8's stance: hide what cannot work rather than leave it
 * broken) — many desktop browsers have no Web Share, or share text but no
 * files.
 */
export function canShareFile(file: File): boolean {
  try {
    return navigator.canShare?.({ files: [file] }) === true
  } catch {
    return false
  }
}

/**
 * Open the share sheet. Dismissing the sheet rejects with `AbortError`, which
 * is the person's decision rather than a failure, so it is reported apart.
 */
export async function shareFile(file: File, title: string): Promise<ShareOutcome> {
  try {
    await navigator.share({ files: [file], title })
    return 'shared'
  } catch (err) {
    return err instanceof DOMException && err.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}
