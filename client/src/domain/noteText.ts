/**
 * FR-7.9's presentation-only reading of a note's body: a phone number
 * becomes a `tel:` link. The note itself stays plain text — this never
 * changes what is stored, only how the sheet renders it.
 *
 * The pattern is deliberately loose (7+ digits, optionally grouped by
 * spaces, dots, dashes or parens, an optional leading `+`) because a note
 * is written by hand for a human reader, not entered into a phone field —
 * "Pizza: 555 0100" and "+41 44 555 01 00" both have to link.
 */

const PHONE_PATTERN = /(\+?\d[\d\s./()-]{5,}\d)/g

export interface NoteTextSegment {
  text: string
  /** A `tel:` href, digits and a leading `+` only, or null for plain text. */
  tel: string | null
}

/** Splits a note's body into plain and phone-number segments, in order. */
export function linkifyPhoneNumbers(body: string): NoteTextSegment[] {
  const segments: NoteTextSegment[] = []
  let lastIndex = 0
  for (const match of body.matchAll(PHONE_PATTERN)) {
    const digits = match[0].replace(/[^\d+]/g, '')
    // A bare run of 1-6 digits reads as a quantity or a year, not a phone
    // number — a key-box code like "4711" stays plain text on purpose.
    if (digits.replace(/^\+/, '').length < 7) continue
    const start = match.index ?? 0
    if (start > lastIndex) segments.push({ text: body.slice(lastIndex, start), tel: null })
    segments.push({ text: match[0], tel: digits })
    lastIndex = start + match[0].length
  }
  if (lastIndex < body.length) segments.push({ text: body.slice(lastIndex), tel: null })
  return segments
}
