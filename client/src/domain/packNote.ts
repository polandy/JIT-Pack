/**
 * FR-25.33: a pack note is one line saying what exactly went in. The
 * database refuses more than this many characters
 * (`trip_items.pack_note`'s CHECK), so the client stores no more.
 */
export const PACK_NOTE_MAX_LENGTH = 60

const LINE_BREAKS = /\s*[\r\n]+\s*/g

/**
 * FR-25.33: what a typed pack note stores — trimmed, on one line and cut to
 * PACK_NOTE_MAX_LENGTH characters; null for a blank entry, which clears the
 * note (the column holds NULL for none, never an empty string).
 *
 * Characters are counted by code point, as SQLite's `length()` counts them:
 * a UTF-16 count would let an emoji-heavy note past the field and into a
 * refused mutation.
 */
export function packNoteValue(typed: string): string | null {
  const line = typed.replace(LINE_BREAKS, ' ').trim()
  if (line === '') return null
  const chars = Array.from(line)
  return chars.length > PACK_NOTE_MAX_LENGTH
    ? chars.slice(0, PACK_NOTE_MAX_LENGTH).join('').trimEnd()
    : line
}
