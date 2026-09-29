import { describe, expect, it } from 'vitest'

import { acceptPart, suggestionFor } from '../linkFill'

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

describe('acceptPart (FR-29.16)', () => {
  it('takes the title at its field — replacing what was typed — and leaves the description suggested', () => {
    expect(acceptPart({ title: 'Seerundgang', note: '' }, PAGE, 'title')).toEqual({
      text: { title: 'Oeschinensee', note: '' },
      rest: { title: null, description: 'Ein Bergsee über Kandersteg' },
    })
  })

  it('takes the description at the note, leaving the title suggested', () => {
    expect(acceptPart(BLANK, PAGE, 'note')).toEqual({
      text: { title: '', note: 'Ein Bergsee über Kandersteg' },
      rest: { title: 'Oeschinensee', description: null },
    })
  })

  it('leaves no suggestion once its last half is taken', () => {
    expect(acceptPart(BLANK, { title: 'Hütte', description: null }, 'title')).toEqual({
      text: { title: 'Hütte', note: '' },
      rest: null,
    })
  })
})
