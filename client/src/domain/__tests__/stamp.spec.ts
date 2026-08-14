/**
 * FR-25.17 / FR-25.12 — the relative-day part of "gepackt von Andy ·
 * heute 14:32". `now` is an argument, so none of this depends on when the
 * suite runs.
 */
import { describe, it, expect } from 'vitest'

import { relativeStamp } from '../stamp'

const now = new Date('2026-08-13T09:00:00')

describe('relativeStamp', () => {
  it('names today rather than dating it', () => {
    expect(relativeStamp('2026-08-13T07:15:00', now, 'de')?.dayKey).toBe('today')
  })

  it('names yesterday', () => {
    expect(relativeStamp('2026-08-12T22:40:00', now, 'de')?.dayKey).toBe('yesterday')
  })

  it('counts calendar days, not elapsed hours — 23:50 is yesterday at 00:10', () => {
    const justAfterMidnight = new Date('2026-08-13T00:10:00')
    expect(relativeStamp('2026-08-12T23:50:00', justAfterMidnight, 'de')?.dayKey).toBe('yesterday')
  })

  it('falls back to a date once the day has no name left', () => {
    const stamp = relativeStamp('2026-08-09T14:32:00', now, 'de')
    expect(stamp?.dayKey).toBeNull()
    expect(stamp?.date).not.toBe('')
  })

  it('keeps the time absolute, because that is what can be acted on', () => {
    expect(relativeStamp('2026-08-13T14:32:00', now, 'de')?.time).toBe('14:32')
  })

  it('reports nothing for a value that is not an instant, rather than "Invalid Date"', () => {
    expect(relativeStamp('yesterday-ish', now, 'de')).toBeNull()
  })
})
