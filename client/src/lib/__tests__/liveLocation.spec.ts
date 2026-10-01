/** FR-29.19: when a position is sent, how others' are kept, and when one is stale. */
import { describe, expect, it } from 'vitest'

import type { LiveLocation } from '@/api/types'
import {
  SHARE_AT_MOST_MS,
  SHARE_EVERY_MS,
  STALE_AFTER_MS,
  applyLocation,
  distanceM,
  freshPeople,
  minutesAgo,
  shouldShare,
  type Fix,
} from '../liveLocation'

const SAMEDAN: Fix = { lat: 46.5333, lon: 9.8724, accuracyM: 10, at: 0 }

/** A fix `metres` north of Samedan, `ms` later. */
function north(metres: number, ms: number): Fix {
  return { ...SAMEDAN, lat: SAMEDAN.lat + metres / 111_195, at: ms }
}

function frame(over: Partial<LiveLocation>): LiveLocation {
  return {
    trip_id: 't1',
    user_id: 'user-sia',
    lat: 46.5,
    lon: 9.8,
    accuracy_m: 8,
    at: '2026-10-01T09:00:00Z',
    gone: false,
    ...over,
  }
}

describe('distanceM', () => {
  it('measures along the Earth', () => {
    expect(distanceM(SAMEDAN, north(1000, 0))).toBeCloseTo(1000, -1)
    expect(distanceM(SAMEDAN, SAMEDAN)).toBe(0)
  })
})

describe('shouldShare', () => {
  it('sends the first position at once', () => {
    expect(shouldShare(null, SAMEDAN)).toBe(true)
  })

  it('holds a move back until the least interval has passed', () => {
    expect(shouldShare(SAMEDAN, north(100, SHARE_AT_MOST_MS - 1))).toBe(false)
    expect(shouldShare(SAMEDAN, north(100, SHARE_AT_MOST_MS))).toBe(true)
  })

  it('sends a small move only once the long interval has passed', () => {
    expect(shouldShare(SAMEDAN, north(5, SHARE_EVERY_MS - 1))).toBe(false)
    expect(shouldShare(SAMEDAN, north(5, SHARE_EVERY_MS))).toBe(true)
  })
})

describe('applyLocation and freshPeople', () => {
  it('keeps the newest position per person, by the time it arrived', () => {
    let people = applyLocation(new Map(), frame({ lat: 46.5 }), 1000)
    people = applyLocation(people, frame({ lat: 46.6 }), 2000)
    people = applyLocation(people, frame({ user_id: 'user-andy', lat: 46.7 }), 3000)
    expect(freshPeople(people, 3000)).toEqual([
      { userId: 'user-andy', fix: { lat: 46.7, lon: 9.8, accuracyM: 8, at: 3000 } },
      { userId: 'user-sia', fix: { lat: 46.6, lon: 9.8, accuracyM: 8, at: 2000 } },
    ])
  })

  it('takes a person off when they stop sharing', () => {
    const people = applyLocation(new Map(), frame({}), 1000)
    expect(freshPeople(applyLocation(people, frame({ gone: true }), 2000), 2000)).toEqual([])
  })

  it('does not draw a position that has gone stale', () => {
    const people = applyLocation(new Map(), frame({}), 0)
    expect(freshPeople(people, STALE_AFTER_MS - 1)).toHaveLength(1)
    expect(freshPeople(people, STALE_AFTER_MS)).toEqual([])
  })
})

describe('minutesAgo', () => {
  it('counts whole minutes, never below none', () => {
    expect(minutesAgo(SAMEDAN, 150_000)).toBe(2)
    expect(minutesAgo({ ...SAMEDAN, at: 5000 }, 0)).toBe(0)
  })
})
