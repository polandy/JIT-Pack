/**
 * FR-24.1/FR-20.1: what M10 offers in its two pickers, and how much of the tag
 * shelf a collapsed form shows. The derivations were reachable only through the
 * built screen, so what keeps the form from scrolling was asserted by nothing.
 */
import { describe, expect, it } from 'vitest'

import {
  DEPENDENCY_OFFER_CAP,
  chipsWithinRows,
  dependencyOffer,
  tagOffer,
} from '../itemEditorOffers'

const tags = (...names: string[]) => names.map((name, i) => ({ id: `t${i}`, name }))
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `tag${i}` }))

describe('tagOffer (FR-24.1)', () => {
  it('offers every unassigned tag while nothing is being searched, in vocabulary order', () => {
    const offer = tagOffer(many(40), new Set(), '')
    expect(offer.matches).toHaveLength(40)
    expect(offer.matches[39]!.name).toBe('tag39')
  })

  it('leaves out the tags this item already carries — they are pinned above', () => {
    const offer = tagOffer(tags('Winter', 'Sommer'), new Set(['t0']), '')
    expect(offer.matches.map((tag) => tag.name)).toEqual(['Sommer'])
  })

  it('matches on a substring, ignoring case', () => {
    const offer = tagOffer(tags('Winter', 'Sommer'), new Set(), 'MME')
    expect(offer.matches.map((tag) => tag.name)).toEqual(['Sommer'])
  })

  it('offers to create a name no tag carries', () => {
    expect(tagOffer(tags('Winter'), new Set(), 'Regen').canCreate).toBe(true)
  })

  it('does not offer to create one that exists under a different case', () => {
    expect(tagOffer(tags('Winter'), new Set(), 'winter').canCreate).toBe(false)
  })

  it('does not offer to create one this item already carries, though it is not listed', () => {
    const offer = tagOffer(tags('Winter'), new Set(['t0']), 'Winter')
    expect(offer.matches).toEqual([])
    expect(offer.canCreate).toBe(false)
  })

  it('offers nothing to create while the box is empty', () => {
    expect(tagOffer(tags('Winter'), new Set(), '   ').canCreate).toBe(false)
  })
})

describe('chipsWithinRows (FR-24.1)', () => {
  it('counts the leading chips whose top edge lies on one of the first lines', () => {
    expect(chipsWithinRows([0, 0, 0, 36, 36, 72, 72], 2)).toBe(5)
  })

  it('counts every chip when they fill no more lines than allowed', () => {
    expect(chipsWithinRows([0, 0, 36], 2)).toBe(3)
  })

  it('treats a sub-pixel difference as the same line', () => {
    expect(chipsWithinRows([0, 0.5, 36, 36.4, 72], 2)).toBe(4)
  })

  it('counts nothing for no chips', () => {
    expect(chipsWithinRows([], 2)).toBe(0)
  })
})

describe('dependencyOffer (FR-20.1)', () => {
  it('never offers the item itself — that is the cycle the domain rejects', () => {
    const offer = dependencyOffer(tags('Zelt', 'Hering'), {
      excludeId: 't0',
      takenIds: new Set(),
    })
    expect(offer.map((row) => row.name)).toEqual(['Hering'])
  })

  it('leaves out the mains already depended on', () => {
    const offer = dependencyOffer(tags('Zelt', 'Hering'), { takenIds: new Set(['t1']) })
    expect(offer.map((row) => row.name)).toEqual(['Zelt'])
  })

  it('caps the result list', () => {
    expect(dependencyOffer(many(DEPENDENCY_OFFER_CAP + 3), { takenIds: new Set() })).toHaveLength(
      DEPENDENCY_OFFER_CAP,
    )
  })

  it('counts the exclusions before the cap, not after', () => {
    const offer = dependencyOffer(many(DEPENDENCY_OFFER_CAP + 1), {
      excludeId: 't0',
      takenIds: new Set(),
    })
    expect(offer).toHaveLength(DEPENDENCY_OFFER_CAP)
    expect(offer.map((row) => row.id)).not.toContain('t0')
  })
})
