import { describe, expect, it } from 'vitest'

import type { IdeaImage } from '@/types/domain'
import {
  MAX_IDEA_IMAGES,
  canAddPicture,
  coverMoves,
  ideaPictures,
  nextPicturePosition,
} from '../pictures'

function picture(id: string, position: number, ideaId = 'idea-1'): IdeaImage {
  return { id, trip_id: 'trip-1', idea_id: ideaId, image_hash: `h-${id}`, position }
}

describe('ideaPictures (FR-29.5)', () => {
  it('lists one idea’s pictures, cover first', () => {
    const images = [picture('b', 2), picture('x', 0, 'idea-2'), picture('a', 1)]
    expect(ideaPictures('idea-1', images).map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('lets the id decide between two pictures on one position, so every device agrees', () => {
    const images = [picture('z', 0), picture('m', 0)]
    expect(ideaPictures('idea-1', images).map((i) => i.id)).toEqual(['m', 'z'])
  })
})

describe('adding a picture (FR-29.5)', () => {
  it('takes four and no more', () => {
    const three = [picture('a', 0), picture('b', 1), picture('c', 2)]
    expect(canAddPicture(three)).toBe(true)
    expect(canAddPicture([...three, picture('d', 3)])).toBe(false)
    expect(MAX_IDEA_IMAGES).toBe(4)
  })

  it('puts the new one behind the last, not into a gap', () => {
    expect(nextPicturePosition([])).toBe(0)
    expect(nextPicturePosition([picture('a', 0), picture('c', 2)])).toBe(3)
  })
})

describe('coverMoves — „Als Titelbild“ (FR-29.5)', () => {
  const pictures = [picture('a', 0), picture('b', 1), picture('c', 2)]

  it('moves the chosen picture to the front and keeps the others’ order behind it', () => {
    expect(coverMoves(pictures, 'c').map(({ image, position }) => [image.id, position])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ])
  })

  it('writes only the pictures whose place changes', () => {
    expect(coverMoves(pictures, 'b').map(({ image }) => image.id)).toEqual(['b', 'a'])
  })

  it('writes nothing for the cover itself, or for a picture that is gone', () => {
    expect(coverMoves(pictures, 'a')).toEqual([])
    expect(coverMoves(pictures, 'gone')).toEqual([])
  })

  it('closes the gaps a deleted picture left, writing only what moved', () => {
    const gapped = [picture('a', 0), picture('c', 2), picture('d', 3)]
    // `c` lands on 2, where it already stands.
    expect(coverMoves(gapped, 'd').map(({ image, position }) => [image.id, position])).toEqual([
      ['d', 0],
      ['a', 1],
    ])
  })
})
