/** FR-29.17 — how a track's figures read on its card and on the board. */
import { describe, expect, it } from 'vitest'

import { formatDistance, formatDuration, formatMetres } from '../trackFormat'

describe('a track’s figures (FR-29.17)', () => {
  it('reads a distance with one decimal below ten kilometres and none from there', () => {
    expect(formatDistance(7_400)).toBe('7.4 km')
    expect(formatDistance(14_960)).toBe('15 km')
  })

  it('reads metres whole', () => {
    expect(formatMetres(519.6)).toBe('520 m')
  })

  it('reads a time in hours and two-digit minutes, rounded to five', () => {
    expect(formatDuration(218)).toBe('3 h 40')
    expect(formatDuration(62)).toBe('1 h 00')
    expect(formatDuration(0)).toBe('0 h 00')
  })
})
