import { describe, expect, it } from 'vitest'

import { parseTripFilter, TRIP_FILTERS } from '../tripFilter'

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
