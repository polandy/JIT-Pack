/**
 * Which of a trip's four views stands in the page and which stands in the
 * bar's ⋮ (FR-21.21, ADR-051 amendment 1).
 *
 * The split is a rule rather than two lists, and this is where the rule is
 * readable: two screens render from it — the switcher under the page's name
 * and the bar's overflow — and between them they must show every view exactly
 * once. A view that both of them show is offered twice; one that neither
 * shows is unreachable from the trip, which is what the ⋮ of ADR-050 was.
 */
import { describe, expect, it } from 'vitest'

import {
  TRIP_VIEW_IDS,
  tripViewEntry,
  tripViewMenu,
  PACKING_VIEWS,
  tripViewPills,
  type TripViewId,
} from '@/lib/tripViews'

const TRIP = 'trip-1'

describe('the trip views that earn a pill', () => {
  // FR-7.13: the notes are the fourth view worked in — written in, not read once.
  it('shows the four a trip is worked in, in the order it is worked through', () => {
    const worked = ['packing', 'shopping', 'tasks', 'notes']
    for (const current of ['packing', 'shopping', 'tasks', 'notes'] as const) {
      expect(tripViewPills(current)).toEqual(worked)
    }
  })

  /*
   * Standing in a view the row would not otherwise show still has to read as
   * standing somewhere: a switcher whose every pill is inactive has stopped
   * answering the half of its job that is "where am I".
   */
  it('adds the view being looked at when it is none of them', () => {
    expect(tripViewPills('luggage')).toEqual(['packing', 'shopping', 'tasks', 'notes', 'luggage'])
    expect(tripViewPills('analytics')).toEqual([
      'packing',
      'shopping',
      'tasks',
      'notes',
      'analytics',
    ])
  })

  it('offers the rest in the bar from inside packing, so every view is reachable from there', () => {
    for (const current of PACKING_VIEWS) {
      const offered = [...tripViewPills(current), ...tripViewMenu(current)]
      expect([...offered].sort()).toEqual([...TRIP_VIEW_IDS].sort())
    }
  })

  // A ⋮ acts on its own context: the luggage and the
  // analytics are packing's, and the packing pill is the way to them.
  it('offers nothing in the bar from the shopping list, the tasks or the notes', () => {
    expect(tripViewMenu('shopping')).toEqual([])
    expect(tripViewMenu('tasks')).toEqual([])
    expect(tripViewMenu('notes')).toEqual([])
  })

  it('never offers the packing list in the menu — it is the row’s first pill', () => {
    for (const current of TRIP_VIEW_IDS) {
      expect(tripViewMenu(current)).not.toContain('packing')
    }
  })

  it('leaves the current view out of the menu, which is where it already stands', () => {
    expect(tripViewMenu('luggage')).toEqual(['analytics'])
    expect(tripViewMenu('analytics')).toEqual(['luggage'])
    expect(tripViewMenu('packing')).toEqual(['luggage', 'analytics'])
  })
})

describe('what a view is called and where it goes', () => {
  it('names each view as a word and points it at this trip', () => {
    expect(tripViewEntry('luggage', TRIP)).toMatchObject({
      label: 'Luggage',
      path: `/trips/${TRIP}/containers`,
      // The same in either shape: the bar gives a menu entry the id its pill
      // would have carried, which is what spared the e2e cases the move.
      testid: 'trip-view-luggage',
    })
    expect(tripViewEntry('analytics', TRIP)).toMatchObject({
      label: 'Analytics',
      path: `/trips/${TRIP}/analytics`,
    })
    expect(tripViewEntry('packing', TRIP)).toMatchObject({
      label: 'Packing list',
      path: `/trips/${TRIP}`,
    })
  })

  /*
   * A pill can carry a badge and an action-sheet entry cannot, so the count
   * lives in the word (ADR-050) — which is what lets the shopping list move
   * between the two shapes without losing it.
   */
  it('puts a view’s count in its word, and offers the word alone at zero', () => {
    const counts = { shopping: () => 3 }
    expect(tripViewEntry('shopping', TRIP, counts).label).toBe('Shopping (3)')
    expect(tripViewEntry('shopping', TRIP, { shopping: () => 0 }).label).toBe('Shopping')
    expect(tripViewEntry('shopping', TRIP).label).toBe('Shopping')
  })

  // FR-7.13: the notes count only what is new, and say so by colour.
  it('marks the notes’ count as new, and no other view’s', () => {
    const counts = { shopping: () => 3, notes: () => 2 }
    expect(tripViewEntry('notes', TRIP, counts)).toMatchObject({
      label: 'Notes · 2 new',
      count: 2,
      countIsNew: true,
      path: `/trips/${TRIP}/notes`,
    })
    expect(tripViewEntry('shopping', TRIP, counts).countIsNew).toBe(false)
    expect(tripViewEntry('notes', TRIP).label).toBe('Notes')
  })

  it('counts for the trip it was asked about', () => {
    const asked: string[] = []
    tripViewEntry('shopping', TRIP, {
      shopping: (tripId) => {
        asked.push(tripId)
        return 1
      },
    })
    expect(asked).toEqual([TRIP])
  })

  /*
   * Every view is describable, and no two of them reach for one glyph (G-12,
   * E2E-G12-05) — some views wear their icon in a menu, where the word is
   * beside it, and the others in a pill, where below 480 px the word is
   * alone.
   */
  it('gives every view a word, a destination and a glyph of its own', () => {
    const entries = TRIP_VIEW_IDS.map((id: TripViewId) => tripViewEntry(id, TRIP))
    // Named and pointed at *this* trip, read as one record per view so a
    // failure says which of the four is the empty one.
    expect(
      entries.map((entry) => [entry.id, entry.label !== '', entry.path.includes(TRIP)]),
    ).toEqual(TRIP_VIEW_IDS.map((id) => [id, true, true]))
    const glyphs = entries.map((entry) => entry.icon)
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })
})
