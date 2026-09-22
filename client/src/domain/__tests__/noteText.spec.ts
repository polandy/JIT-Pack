/**
 * FR-7.9: a note's phone number reads as a `tel:` link; a short code does not.
 */
import { describe, it, expect } from 'vitest'

import { linkifyPhoneNumbers } from '../noteText'

describe('linkifyPhoneNumbers', () => {
  it('leaves plain text with no number alone', () => {
    expect(linkifyPhoneNumbers('Schlüsselfach rechts vom Eingang')).toEqual([
      { text: 'Schlüsselfach rechts vom Eingang', tel: null },
    ])
  })

  it('links a spaced phone number and keeps the surrounding words as text', () => {
    const segments = linkifyPhoneNumbers('Pizzakurier: 044 555 01 00, ab 18 Uhr')
    expect(segments).toEqual([
      { text: 'Pizzakurier: ', tel: null },
      { text: '044 555 01 00', tel: '0445550100' },
      { text: ', ab 18 Uhr', tel: null },
    ])
  })

  it('keeps the leading + on an international number', () => {
    const segments = linkifyPhoneNumbers('+41 44 555 01 00')
    expect(segments).toEqual([{ text: '+41 44 555 01 00', tel: '+41445550100' }])
  })

  it('never links a short key-box code', () => {
    expect(linkifyPhoneNumbers('Schlüsselfach: 4711')).toEqual([
      { text: 'Schlüsselfach: 4711', tel: null },
    ])
  })

  it('links a number written with dots or dashes', () => {
    const segments = linkifyPhoneNumbers('044.555.01.00')
    expect(segments).toEqual([{ text: '044.555.01.00', tel: '0445550100' }])
  })
})
