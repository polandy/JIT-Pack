import { describe, expect, it } from 'vitest'

import { acceptSuggestion, fillFromLink, suggestionFrom } from '../linkFill'

const PAGE = { title: 'Oeschinensee', description: 'Ein Bergsee über Kandersteg' }
const LINK = 'https://www.oeschinensee.ch/de/sommer'

describe('fillFromLink (FR-29.16)', () => {
  it('names a blank title after the link’s site, so a pasted link alone can be saved', () => {
    expect(fillFromLink({ title: '  ', note: '' }, LINK)).toEqual({
      text: { title: 'oeschinensee.ch', note: '' },
      placeholder: 'oeschinensee.ch',
    })
  })

  it('leaves a typed title, and places nothing', () => {
    expect(fillFromLink({ title: 'Seerundgang', note: '' }, LINK)).toEqual({
      text: { title: 'Seerundgang', note: '' },
      placeholder: null,
    })
  })
})

describe('suggestionFrom (FR-29.16)', () => {
  it('suggests what the page says', () => {
    expect(suggestionFrom(PAGE, { title: 'oeschinensee.ch', note: '' })).toEqual(PAGE)
  })

  it('suggests nothing where the page says nothing new', () => {
    expect(suggestionFrom({ title: null, description: null }, { title: '', note: '' })).toBeNull()
    expect(
      suggestionFrom(PAGE, { title: 'Oeschinensee', note: 'Ein Bergsee über Kandersteg' }),
    ).toBeNull()
  })

  it('keeps only the half that would change something', () => {
    expect(suggestionFrom(PAGE, { title: 'Oeschinensee', note: '' })).toEqual({
      title: null,
      description: 'Ein Bergsee über Kandersteg',
    })
  })
})

describe('acceptSuggestion (FR-29.16)', () => {
  it('takes both halves when confirmed — a confirmed suggestion replaces what was there', () => {
    expect(acceptSuggestion({ title: 'Seerundgang', note: 'mit Kinderwagen' }, PAGE)).toEqual({
      title: 'Oeschinensee',
      note: 'Ein Bergsee über Kandersteg',
    })
  })

  it('leaves a field the suggestion has nothing for', () => {
    expect(
      acceptSuggestion(
        { title: 'Seerundgang', note: 'mit Kinderwagen' },
        { title: 'Hütte', description: null },
      ),
    ).toEqual({ title: 'Hütte', note: 'mit Kinderwagen' })
  })
})
