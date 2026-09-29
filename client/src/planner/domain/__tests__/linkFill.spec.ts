import { describe, expect, it } from 'vitest'

import { acceptSuggestion, suggestionFor } from '../linkFill'

const PAGE = { title: 'Oeschinensee', description: 'Ein Bergsee über Kandersteg' }
const LINK = 'https://www.oeschinensee.ch/de/sommer'
const BLANK = { title: '', note: '' }

describe('suggestionFor (FR-29.16)', () => {
  it('suggests what the page says', () => {
    expect(suggestionFor(LINK, PAGE, BLANK)).toEqual(PAGE)
  })

  it('suggests the site as a title where the page was not read — a link alone is one tap from saving', () => {
    expect(suggestionFor(LINK, null, BLANK)).toEqual({
      title: 'oeschinensee.ch',
      description: null,
    })
  })

  it('suggests the site only for a blank title — never over one somebody typed', () => {
    expect(suggestionFor(LINK, null, { title: 'Seerundgang', note: '' })).toBeNull()
  })

  it('still suggests the page’s own title over a typed one — the page may know better', () => {
    expect(suggestionFor(LINK, PAGE, { title: 'Seerundgang', note: '' })).toEqual(PAGE)
  })

  it('suggests nothing where it would change nothing', () => {
    expect(
      suggestionFor(LINK, PAGE, { title: 'Oeschinensee', note: 'Ein Bergsee über Kandersteg' }),
    ).toBeNull()
    expect(
      suggestionFor(LINK, { title: null, description: null }, { title: 'x', note: '' }),
    ).toBeNull()
  })

  it('keeps only the half that would change something', () => {
    expect(suggestionFor(LINK, PAGE, { title: 'Oeschinensee', note: '' })).toEqual({
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
