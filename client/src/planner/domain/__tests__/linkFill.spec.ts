import { describe, expect, it } from 'vitest'

import { fillFromPreview } from '../linkFill'

const PAGE = { title: 'Oeschinensee', description: 'Ein Bergsee über Kandersteg' }

describe('fillFromPreview (FR-29.16)', () => {
  it('fills a blank title and note from the page', () => {
    expect(fillFromPreview({ title: '', note: '  ' }, PAGE)).toEqual({
      title: 'Oeschinensee',
      note: 'Ein Bergsee über Kandersteg',
    })
  })

  it('leaves what somebody typed', () => {
    expect(fillFromPreview({ title: 'Seerundgang', note: 'mit Kinderwagen' }, PAGE)).toEqual({
      title: 'Seerundgang',
      note: 'mit Kinderwagen',
    })
  })

  it('fills one and keeps the other', () => {
    expect(fillFromPreview({ title: 'Seerundgang', note: '' }, PAGE)).toEqual({
      title: 'Seerundgang',
      note: 'Ein Bergsee über Kandersteg',
    })
  })

  it('leaves a blank blank when the page says nothing', () => {
    expect(fillFromPreview({ title: '', note: '' }, { title: null, description: null })).toEqual({
      title: '',
      note: '',
    })
  })
})
