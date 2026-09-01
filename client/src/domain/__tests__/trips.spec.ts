/** FR-2.1b: ordering trips whose dates may not exist yet. */
import { describe, it, expect } from 'vitest'

import { canJudgeUnused, localIsoDate, tripOrderKey } from '../trips'
import type { Trip } from '@/types/domain'

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
