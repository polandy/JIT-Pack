import { describe, expect, it } from 'vitest'

import { countTripsByFilter, openingFilter, parseTripFilter, TRIP_FILTERS } from '../tripFilter'

/**
 * The vocabulary M18 and M2 share (FR-18.4): a restore names the segment it
 * wants the list to open on, because every restored trip is `planning` and the
 * list opens on Active.
 */
describe('parseTripFilter — the segment another screen may ask for', () => {
  it.each(TRIP_FILTERS)('accepts %s', (name) => {
    expect(parseTripFilter(name)).toBe(name)
  })

  // Null rather than a default: the list leaves its current segment alone. A
  // fallback to 'active' here would reset the user's own choice every time the
  // page is re-entered without a query, which is the failure this returns null
  // to avoid.
  it.each([
    ['an unknown name', 'planning'],
    ['the empty string', ''],
    ['a repeated query parameter', ['planned', 'active']],
    ['nothing at all', undefined],
    ['null', null],
  ])('refuses %s', (_case, value) => {
    expect(parseTripFilter(value)).toBeNull()
  })

  // 'planning' is the DB status and 'planned' the segment; the case above
  // fixes that they are not interchangeable, and this states why it matters.
  it('does not accept the database status in place of the segment name', () => {
    expect(TRIP_FILTERS).not.toContain('planning')
  })
})

/**
 * FR-2.8: M2 opened on *Active*, the one segment that is empty for most of
 * the year. The walk below is the whole rule; the guard it cannot carry —
 * that a list which has not arrived yet counts as zeros — belongs to its
 * caller and is tested at the screen.
 */
describe('countTripsByFilter — what each segment holds', () => {
  it('tallies through the same status mapping the list filters by', () => {
    expect(
      countTripsByFilter([
        { status: 'active' },
        { status: 'planning' },
        { status: 'planning' },
        { status: 'archived' },
      ]),
    ).toEqual({ active: 1, planned: 2, archived: 1 })
  })

  it('counts nothing as three zeros rather than as absent', () => {
    // The screen tells `0` from *unknown*, so the count of an empty list has
    // to be a number: returning a partial record would make them the same.
    expect(countTripsByFilter([])).toEqual({ active: 0, planned: 0, archived: 0 })
  })

  it('files a trip whose status the device does not know under planned', () => {
    expect(countTripsByFilter([{ status: undefined }]).planned).toBe(1)
  })
})

describe('openingFilter — the segment M2 opens on (FR-2.8)', () => {
  it('leaves an empty Active for the planned trips', () => {
    expect(openingFilter('active', { active: 0, planned: 2, archived: 9 })).toBe('planned')
  })

  it('falls through to the archive when nothing is active or planned', () => {
    expect(openingFilter('active', { active: 0, planned: 0, archived: 29 })).toBe('archived')
  })

  it('never takes a segment that is showing something away from the user', () => {
    // The property that keeps this from fighting the user's own tap: the
    // walk only ever fires against a view that shows nothing.
    expect(openingFilter('archived', { active: 3, planned: 2, archived: 29 })).toBe('archived')
  })

  it('lands a device with no trips at all on Active, whatever was last tapped', () => {
    // Active is where the "plan a trip" empty state lives (G-7); a fresh
    // install must not be left looking at an empty archive.
    expect(openingFilter('archived', { active: 0, planned: 0, archived: 0 })).toBe('active')
  })

  it('prefers the earlier segment when the current one is empty', () => {
    expect(openingFilter('planned', { active: 1, planned: 0, archived: 5 })).toBe('active')
  })
})
