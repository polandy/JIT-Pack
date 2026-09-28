import { describe, expect, it } from 'vitest'

import { fillFromLink, fillFromPreview } from '../linkFill'

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

describe('fillFromPreview (FR-29.16)', () => {
  it('fills a blank title and note from the page', () => {
    expect(fillFromPreview({ title: '', note: '  ' }, PAGE, null)).toEqual({
      title: 'Oeschinensee',
      note: 'Ein Bergsee über Kandersteg',
    })
  })

  it('replaces the site-name placeholder, which nobody typed', () => {
    expect(
      fillFromPreview({ title: 'oeschinensee.ch', note: '' }, PAGE, 'oeschinensee.ch'),
    ).toEqual({
      title: 'Oeschinensee',
      note: 'Ein Bergsee über Kandersteg',
    })
  })

  it('leaves what somebody typed', () => {
    expect(
      fillFromPreview({ title: 'Seerundgang', note: 'mit Kinderwagen' }, PAGE, 'oeschinensee.ch'),
    ).toEqual({ title: 'Seerundgang', note: 'mit Kinderwagen' })
  })

  it('fills one and keeps the other', () => {
    expect(fillFromPreview({ title: 'Seerundgang', note: '' }, PAGE, null)).toEqual({
      title: 'Seerundgang',
      note: 'Ein Bergsee über Kandersteg',
    })
  })

  it('keeps the placeholder when the page has no title of its own', () => {
    expect(
      fillFromPreview(
        { title: 'oeschinensee.ch', note: '' },
        { title: null, description: null },
        'oeschinensee.ch',
      ),
    ).toEqual({ title: 'oeschinensee.ch', note: '' })
  })
})
