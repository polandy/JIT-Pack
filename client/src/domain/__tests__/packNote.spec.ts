import { describe, expect, it } from 'vitest'
import { PACK_NOTE_MAX_LENGTH, packNoteValue } from '../packNote'

describe('packNoteValue — what a typed pack note stores (FR-25.33)', () => {
  it.each([
    ['keeps a plain note', 'Jeans', 'Jeans'],
    ['trims the ends', '  Jeans ', 'Jeans'],
    ['a blank entry clears the note', '   ', null],
    ['an empty entry clears the note', '', null],
    [
      'a pasted line break becomes a space, since the note is one line',
      'Jeans\nblau',
      'Jeans blau',
    ],
  ])('%s', (_name, typed, want) => {
    expect(packNoteValue(typed)).toBe(want)
  })

  it("cuts at 60 characters, the column's limit", () => {
    expect(PACK_NOTE_MAX_LENGTH).toBe(60)
    expect(packNoteValue('a'.repeat(61))).toBe('a'.repeat(60))
  })

  it('counts characters as the database does, so an emoji is one, not two', () => {
    const typed = '🧦'.repeat(61)

    const stored = packNoteValue(typed)!

    expect(Array.from(stored)).toHaveLength(60)
  })
})
