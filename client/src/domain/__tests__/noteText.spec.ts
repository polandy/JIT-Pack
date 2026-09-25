/**
 * FR-7.9/FR-7.13: a note's phone number reads as a `tel:` link and a short
 * code as a chip to copy; everything else stays words.
 */
import { describe, it, expect } from 'vitest'

import { noteSegments } from '../noteText'

const text = (t: string) => ({ text: t, tel: null, code: null })
const code = (c: string) => ({ text: c, tel: null, code: c })

describe('noteSegments', () => {
  it('leaves plain text with no number alone', () => {
    expect(noteSegments('Schlüsselfach rechts vom Eingang')).toEqual([
      text('Schlüsselfach rechts vom Eingang'),
    ])
  })

  it('links a spaced phone number and keeps the surrounding words as text', () => {
    expect(noteSegments('Pizzakurier: 044 555 01 00, ab 18 Uhr')).toEqual([
      text('Pizzakurier: '),
      { text: '044 555 01 00', tel: '0445550100', code: null },
      text(', ab 18 Uhr'),
    ])
  })

  it('keeps the leading + on an international number', () => {
    expect(noteSegments('+41 44 555 01 00')).toEqual([
      { text: '+41 44 555 01 00', tel: '+41445550100', code: null },
    ])
  })

  it('links a number written with dots or dashes', () => {
    expect(noteSegments('044.555.01.00')).toEqual([
      { text: '044.555.01.00', tel: '0445550100', code: null },
    ])
  })

  it('never links a short key-box code, and makes it a code instead', () => {
    expect(noteSegments('Schlüsselfach: 4711, links')).toEqual([
      text('Schlüsselfach: '),
      code('4711'),
      text(', links'),
    ])
  })

  it.each([
    ['two digits are a platform, not a code', 'Gleis 12'],
    ['a time is not a code', 'ab 18:30 Uhr'],
    ['a price is not a code', 'kostet 120.50'],
    ['digits inside a word are not a code', 'engadin2026'],
    ['seven digits and more are a phone number or nothing', 'Ref 12345678'],
  ])('%s', (_name, body) => {
    expect(noteSegments(body).every((segment) => segment.code === null)).toBe(true)
  })
})
