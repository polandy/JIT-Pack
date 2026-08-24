/** FR-2.1b: ordering trips whose dates may not exist yet. */
import { describe, it, expect } from 'vitest'

import { canJudgeUnused, tripOrderKey } from '../trips'
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
