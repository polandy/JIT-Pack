/** FR-2.1b: ordering trips whose dates may not exist yet. */
import { describe, it, expect } from 'vitest'

import {
  byDepartureSoonestFirst,
  canJudgeUnused,
  heroTripOf,
  isActive,
  localIsoDate,
  nextLifecycleStep,
  tripOrderKey,
  type LifecycleStep,
} from '../trips'
import {
  TRIP_STATUS_ACTIVE,
  TRIP_STATUS_ARCHIVED,
  TRIP_STATUS_PLANNING,
  type Trip,
  type TripStatus,
} from '@/types/domain'

const when = (year: number, start: string | null = null, end: string | null = null) => ({
  year,
  start_date: start,
  end_date: end,
})

describe('tripOrderKey (FR-2.1b)', () => {
  it('prefers the start date, the anchor a dated trip actually has', () => {
    expect(tripOrderKey(when(2026, '2026-07-10', '2026-07-20'))).toBe('2026-07-10')
  })

  it('falls back to the end date when only that is known', () => {
    expect(tripOrderKey(when(2026, null, '2026-07-20'))).toBe('2026-07-20')
  })

  it('falls back to the year alone, so a trip with no dates still sorts', () => {
    expect(tripOrderKey(when(2027))).toBe('2027-00-00')
  })

  it('keeps years in order across all three shapes', () => {
    const keys = [when(2027), when(2026, '2026-07-10'), when(2025, null, '2025-08-14')]
      .map(tripOrderKey)
      .sort()
    expect(keys).toEqual(['2025-08-14', '2026-07-10', '2027-00-00'])
  })

  it('sorts a year-only trip above the dated trips of its own year, newest first', () => {
    const sorted = [when(2026, '2026-07-10'), when(2026)]
      .map(tripOrderKey)
      .sort((a, b) => b.localeCompare(a))
    expect(sorted[0]).toBe('2026-07-10')
  })
})

describe('canJudgeUnused (FR-9.3)', () => {
  const withStatus = (status: Trip['status']) => ({ status }) as Trip

  it('answers for a running trip and for an archived one', () => {
    // The window outlasts the trip on purpose: M14 runs on the archived
    // trip, and correcting a judgement is not the same act as making one.
    expect(canJudgeUnused(withStatus('active'))).toBe(true)
    expect(canJudgeUnused(withStatus('archived'))).toBe(true)
  })

  it('refuses a trip that has not happened, and a missing one', () => {
    expect(canJudgeUnused(withStatus('planning'))).toBe(false)
    expect(canJudgeUnused(undefined)).toBe(false)
  })
})

/**
 * The day the rules are decided against. It is what `followsGroups` compares
 * an end date to, and the one way it can be wrong without looking wrong is
 * the timezone: `toISOString()` answers in UTC, which puts a trip a day out
 * for anyone far enough east or west of it.
 *
 * The boundary is what says so: the day must turn at **local** midnight. The
 * instants are built with the local constructor, so the case is right in
 * every zone — and it discriminates in every zone but UTC, where a UTC
 * implementation is not a different function.
 */
describe('localIsoDate', () => {
  it('turns the day at local midnight', () => {
    const midnight = new Date(2026, 0, 15, 0, 0, 0).getTime()
    expect(localIsoDate(midnight)).toBe('2026-01-15')
    expect(localIsoDate(midnight - 1)).toBe('2026-01-14')
    expect(localIsoDate(midnight + 23 * 60 * 60 * 1000)).toBe('2026-01-15')
  })

  it('pads the month and the day, so the string sorts as a date', () => {
    expect(localIsoDate(new Date(2026, 8, 5, 12, 0, 0).getTime())).toBe('2026-09-05')
  })
})

/**
 * FR-9.1/FR-9.2 — the lifecycle offers exactly one step at a time, and both
 * M2 and M4 offer it. The rule was written into each of them separately, so
 * a status that gained a step would have gained it on one screen only.
 */
describe('nextLifecycleStep', () => {
  const cases: Array<[TripStatus | undefined, LifecycleStep]> = [
    [TRIP_STATUS_PLANNING, 'start'],
    [TRIP_STATUS_ACTIVE, 'archive'],
    [TRIP_STATUS_ARCHIVED, null],
    [undefined, null],
  ]

  for (const [status, expected] of cases) {
    it(`offers ${expected ?? 'nothing'} for a ${status ?? 'trip that has not loaded'}`, () => {
      const trip = status === undefined ? undefined : ({ status } as Trip)
      expect(nextLifecycleStep(trip)).toBe(expected)
    })
  }
})

describe('isActive', () => {
  it('is true only while the trip is being packed', () => {
    expect(isActive({ status: TRIP_STATUS_ACTIVE } as Trip)).toBe(true)
    expect(isActive({ status: TRIP_STATUS_PLANNING } as Trip)).toBe(false)
    expect(isActive({ status: TRIP_STATUS_ARCHIVED } as Trip)).toBe(false)
  })

  it('is false for a trip that has not loaded', () => {
    expect(isActive(undefined)).toBe(false)
  })
})

describe('byDepartureSoonestFirst (FR-21.13, M1 hero)', () => {
  interface T {
    id: string
    name: string
    status: string
    start_date: string | null
  }

  it('puts the soonest departure first, whatever order it was handed', () => {
    // The hero is the head of this list, and before the rule existed the
    // head was IndexedDB's key order over random ids — so two active trips
    // named a different hero on Chromium than on WebKit.
    const trips: T[] = [
      { id: 'a', name: 'Laos', status: 'active', start_date: '2026-11-02' },
      { id: 'b', name: 'Elba', status: 'active', start_date: '2026-09-20' },
    ]
    expect(byDepartureSoonestFirst(trips).map((t) => t.id)).toEqual(['b', 'a'])
    expect(byDepartureSoonestFirst([...trips].reverse()).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('sorts an undated trip last and breaks a tie by name', () => {
    const trips: T[] = [
      { id: 'z', name: 'Zermatt', status: 'active', start_date: null },
      { id: 'b', name: 'Bern', status: 'active', start_date: '2026-09-20' },
      { id: 'a', name: 'Arosa', status: 'active', start_date: '2026-09-20' },
    ]
    expect(byDepartureSoonestFirst(trips).map((t) => t.id)).toEqual(['a', 'b', 'z'])
  })

  it('judges no status of its own — that belongs to the screen', () => {
    // Deliberately different from `plannedTripsByDeparture`: what is shared
    // between them is the ordering, and "active" is M1's predicate.
    const trips: T[] = [
      { id: 'p', name: 'Laos', status: 'planning', start_date: '2026-01-01' },
      { id: 'a', name: 'Elba', status: 'active', start_date: '2026-09-20' },
    ]
    expect(byDepartureSoonestFirst(trips).map((t) => t.id)).toEqual(['p', 'a'])
  })

  it('leaves the array it was given alone', () => {
    // The store's list is reactive state, and an in-place sort would reorder
    // it for every other reader on the screen.
    const trips: T[] = [
      { id: 'a', name: 'Laos', status: 'active', start_date: '2026-11-02' },
      { id: 'b', name: 'Elba', status: 'active', start_date: '2026-09-20' },
    ]
    byDepartureSoonestFirst(trips)
    expect(trips.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('heroTripOf (FR-21.15, the trip M1 and M2 both name)', () => {
  interface T {
    id: string
    name: string
    status: string
    start_date: string | null
  }

  const trips: T[] = [
    { id: 'p', name: 'Laos', status: 'planning', start_date: '2026-01-01' },
    { id: 'late', name: 'Elba', status: 'active', start_date: '2026-11-02' },
    { id: 'soon', name: 'Samedan', status: 'active', start_date: '2026-09-20' },
    { id: 'old', name: 'Kreta', status: 'archived', start_date: '2019-07-01' },
  ]

  it('is the running trip that departs soonest, not the one that starts first', () => {
    // The planning trip departs before every active one and is not the trip
    // anybody is packing — which is the whole distinction the hero draws.
    expect(heroTripOf(trips)?.id).toBe('soon')
  })

  it('answers the same whatever order the store handed the trips over', () => {
    expect(heroTripOf([...trips].reverse())?.id).toBe('soon')
  })

  it('names nothing when no trip is running', () => {
    // Not "the next one": M2's other two segments are lists by definition,
    // and a hero over a planned trip would claim you are packing it.
    expect(heroTripOf(trips.filter((t) => t.status !== 'active'))).toBeNull()
  })

  it('names an undated running trip when it is the only one', () => {
    // Undated sorts last (FR-2.1b) — last of one is still the trip you are on.
    const undated: T[] = [{ id: 'u', name: 'Irgendwann', status: 'active', start_date: null }]
    expect(heroTripOf(undated)?.id).toBe('u')
  })
})
