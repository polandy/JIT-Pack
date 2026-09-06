/**
 * UX-14/FR-20.1: what M10 offers in its two pickers. Both derivations were
 * reachable only through the built screen, so the cap that exists to keep the
 * form from scrolling was asserted by nothing.
 */
import { describe, expect, it } from 'vitest'

import { DEPENDENCY_OFFER_CAP, TAG_OFFER_CAP, dependencyOffer, tagOffer } from '../itemEditorOffers'

const tags = (...names: string[]) => names.map((name, i) => ({ id: `t${i}`, name }))
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `tag${i}` }))

describe('tagOffer (UX-14)', () => {
  it('holds the shelf to the cap while nothing is being searched', () => {
    const offer = tagOffer(many(TAG_OFFER_CAP + 5), new Set(), '')
    expect(offer.matches).toHaveLength(TAG_OFFER_CAP)
    expect(offer.hiddenCount).toBe(5)
  })

  it('lifts the cap once a query is filtering — a match must not look absent', () => {
    const offer = tagOffer(many(TAG_OFFER_CAP + 5), new Set(), 'tag')
    expect(offer.matches).toHaveLength(TAG_OFFER_CAP + 5)
    expect(offer.hiddenCount).toBe(0)
  })

  it('leaves out the tags this item already carries — they are pinned above', () => {
    const offer = tagOffer(tags('Winter', 'Sommer'), new Set(['t0']), '')
    expect(offer.matches.map((tag) => tag.name)).toEqual(['Sommer'])
  })

  it('matches on a substring, ignoring case', () => {
    const offer = tagOffer(tags('Winter', 'Sommer'), new Set(), 'MME')
    expect(offer.matches.map((tag) => tag.name)).toEqual(['Sommer'])
  })

  it('counts an assigned tag as neither offered nor hidden', () => {
    const offer = tagOffer(many(TAG_OFFER_CAP + 1), new Set(['t0']), '')
    expect(offer.matches).toHaveLength(TAG_OFFER_CAP)
    expect(offer.hiddenCount).toBe(0)
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
