/**
 * M1's greeting buckets (UX-15, 2026-08-25 UX review): the dashboard said
 * „Guten Morgen" at 00:14, because everything below noon was morning. Night
 * gets a neutral line instead of a time-of-day claim — a greeting that names
 * the wrong part of the day is worse than one that names none.
 */
import { describe, it, expect } from 'vitest'

import { greetingKey } from '../greeting'

describe('greetingKey (M1, UX-15)', () => {
  it.each([
    [0, 'dashboard.greetingNight'],
    [4, 'dashboard.greetingNight'],
    [5, 'dashboard.greetingMorning'],
    [9, 'dashboard.greetingMorning'], // the visual baselines freeze the clock here
    [11, 'dashboard.greetingMorning'],
    [12, 'dashboard.greetingAfternoon'],
    [17, 'dashboard.greetingAfternoon'],
    [18, 'dashboard.greetingEvening'],
    [21, 'dashboard.greetingEvening'],
    [22, 'dashboard.greetingNight'],
    [23, 'dashboard.greetingNight'],
  ] as const)('hour %i → %s', (hour, key) => {
    expect(greetingKey(hour)).toBe(key)
  })

  it('00:14 is not morning — the UX-15 finding', () => {
    expect(greetingKey(0)).not.toBe('dashboard.greetingMorning')
  })
})
