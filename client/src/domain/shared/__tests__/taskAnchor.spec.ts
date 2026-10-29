import { describe, expect, it } from 'vitest'
import {
  ANCHOR_KIND,
  legacyAnchorOfRow,
  hasAnchor,
  leadBefore,
  tripStartAnchor,
} from '../taskAnchor'

describe('taskAnchor (FR-29.21, FR-13.4, ADR-108)', () => {
  it('leadBefore subtracts the lead from the anchor’s day, and has none without a day', () => {
    expect(leadBefore('2026-11-04', 7)).toBe('2026-10-28')
    expect(leadBefore(null, 7)).toBeNull()
  })

  it('hasAnchor needs both the kind and a lead', () => {
    expect(hasAnchor({ anchor_kind: 'idea', anchor_lead_days: 0 }, ANCHOR_KIND.idea)).toBe(true)
    expect(hasAnchor({ anchor_kind: 'idea', anchor_lead_days: 3 }, ANCHOR_KIND.tripStart)).toBe(
      false,
    )
    expect(hasAnchor({ anchor_kind: 'idea', anchor_lead_days: null }, ANCHOR_KIND.idea)).toBe(false)
    expect(hasAnchor({}, ANCHOR_KIND.idea)).toBe(false)
  })

  it('legacyAnchorOfRow reads a Local Mode row written before ADR-108', () => {
    expect(legacyAnchorOfRow({ start_lead_days: 28 })).toEqual({
      anchor_kind: 'trip_start',
      anchor_lead_days: 28,
    })
    expect(legacyAnchorOfRow({ lead_days: 7, idea_id: 'i1' })).toEqual({
      anchor_kind: 'idea',
      anchor_lead_days: 7,
    })
  })

  it('legacyAnchorOfRow leaves a plain task, or an idea’s origin without a lead, unanchored', () => {
    const none = { anchor_kind: null, anchor_lead_days: null }
    expect(legacyAnchorOfRow({})).toEqual(none)
    expect(legacyAnchorOfRow({ idea_id: 'i1' })).toEqual(none)
    expect(legacyAnchorOfRow({ lead_days: 7, idea_id: null })).toEqual(none)
  })

  it('tripStartAnchor is none for a series task with no lead', () => {
    expect(tripStartAnchor(null)).toBeNull()
    expect(tripStartAnchor(7)).toEqual({ kind: 'trip_start', leadDays: 7 })
  })
})
