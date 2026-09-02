import { describe, expect, it } from 'vitest'

import { NAV_ANCHORS, isAnchorActive } from '@/router/anchors'
import { PATH, tripItemPath } from '@/router/paths'

/**
 * G-1/G-9: the rail and the tab bar light the same anchor, and only one.
 * The rule had a comment and no test — it compares against the anchor's own
 * `href` since U-9, where it used to rebuild `/tabs/${match}`.
 */

const anchorFor = (match: string) => NAV_ANCHORS.find((a) => a.match === match)!

describe('isAnchorActive', () => {
  it('lights the anchor whose screen is open', () => {
    expect(isAnchorActive(PATH.items, anchorFor('items'))).toBe(true)
  })

  it('lights no other anchor', () => {
    expect(isAnchorActive(PATH.items, anchorFor('trips'))).toBe(false)
  })

  it('leaves the inventory dark inside a trip item sheet', () => {
    // A substring test lit `items` on `/trips/t1/items/i2`, which pointed
    // the user at the master inventory while they were inside a trip.
    expect(isAnchorActive(tripItemPath('t1', 'i2'), anchorFor('items'))).toBe(false)
  })

  it('lights exactly one anchor on each anchor screen', () => {
    for (const anchor of NAV_ANCHORS) {
      const lit = NAV_ANCHORS.filter((candidate) => isAnchorActive(anchor.href, candidate))
      expect(lit).toEqual([anchor])
    }
  })
})
