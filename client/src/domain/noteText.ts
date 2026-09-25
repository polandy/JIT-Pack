/**
 * FR-7.9's presentation-only reading of a note's body: a phone number
 * becomes a `tel:` link, and (FR-7.13's rework) a short code a chip that
 * copies itself. The note itself stays plain text — this never changes what
 * is stored, only how it renders.
 *
 * The phone pattern is deliberately loose (7+ digits, optionally grouped by
 * spaces, dots, dashes or parens, an optional leading `+`) because a note
 * is written by hand for a human reader, not entered into a phone field —
 * "Pizza: 555 0100" and "+41 44 555 01 00" both have to link.
 */

const PHONE_PATTERN = /(\+?\d[\d\s./()-]{5,}\d)/g
/**
 * A key-box code, a door code, a PIN: three to six digits standing alone.
 * Two digits are a platform or a quantity, and a longer run is a phone
 * number or nothing a person copies. A year matches too, and costs nothing:
 * copying it is harmless, and telling „2026" from „4711" is a guess.
 */
const CODE_PATTERN = /(?<![\d.,:])\b\d{3,6}\b(?![.,:]\d)/g
const PHONE_MIN_DIGITS = 7

export interface NoteTextSegment {
  text: string
  /** A `tel:` href, digits and a leading `+` only, or null. */
  tel: string | null
  /** A code to copy — the digits as written — or null. */
  code: string | null
}

function plain(text: string): NoteTextSegment {
  return { text, tel: null, code: null }
}

/** Splits plain text into words and codes. */
function withCodes(text: string, out: NoteTextSegment[]): void {
  let lastIndex = 0
  for (const match of text.matchAll(CODE_PATTERN)) {
    const start = match.index ?? 0
    if (start > lastIndex) out.push(plain(text.slice(lastIndex, start)))
    out.push({ text: match[0], tel: null, code: match[0] })
    lastIndex = start + match[0].length
  }
  if (lastIndex < text.length) out.push(plain(text.slice(lastIndex)))
}

/** Splits a note's body into plain, phone-number and code segments, in order. */
export function noteSegments(body: string): NoteTextSegment[] {
  const segments: NoteTextSegment[] = []
  let lastIndex = 0
  for (const match of body.matchAll(PHONE_PATTERN)) {
    const digits = match[0].replace(/[^\d+]/g, '')
    // A bare run of fewer digits reads as a code, a quantity or a year.
    if (digits.replace(/^\+/, '').length < PHONE_MIN_DIGITS) continue
    const start = match.index ?? 0
    if (start > lastIndex) withCodes(body.slice(lastIndex, start), segments)
    segments.push({ text: match[0], tel: digits, code: null })
    lastIndex = start + match[0].length
  }
  if (lastIndex < body.length) withCodes(body.slice(lastIndex), segments)
  return segments
}
