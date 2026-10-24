// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, setLocale } from '@/i18n'
import {
  seriesLeadChipName,
  seriesLeadLineText,
  seriesLeadName,
  seriesLeadText,
  seriesOfferDue,
} from '../seriesTaskText'

/** A Monday; a week before it is Monday 26 October. */
const TRIP_START = '2026-11-02'

describe('FR-13.4 a series task lead in words (ADR-106)', () => {
  beforeEach(() => setLocale('en'))
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it('names a chip lead by its own word, and any other lead in days', () => {
    expect(seriesLeadName(7)).toBe('1 week')
    expect(seriesLeadName(56)).toBe('8 weeks')
    expect(seriesLeadName(10)).toBe('10 days')
  })

  it('gives the 1-day chip its idiom, and the no-lead chip its own name', () => {
    expect(seriesLeadChipName(1)).toBe('The day before')
    expect(seriesLeadChipName(3)).toBe('3 days')
    expect(seriesLeadChipName(null)).toBe('No due day')
  })

  it('writes the M16 line against departure, or says there is no due day', () => {
    expect(seriesLeadLineText(28)).toBe('4 weeks before departure')
    expect(seriesLeadLineText(null)).toBe('No due day')
  })

  it('dates the sheet line once the trip has a start, and names only the lead before', () => {
    expect(seriesLeadText(7, '2026-10-26')).toBe(
      'Mon, 26.10 · 1 week before departure, moves with it',
    )
    expect(seriesLeadText(7, null)).toBe('1 week before departure — once the trip has dates')
  })
})

describe('FR-13.4 the offer sheet reads a due day against the trip it would land on', () => {
  beforeEach(() => setLocale('en'))
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it('names the day while the lead still lies ahead', () => {
    expect(seriesOfferDue(7, TRIP_START, '2026-10-05')).toEqual({
      text: 'due Mon, 26.10',
      overdue: false,
    })
  })

  it('reads overdue once the lead has passed, rather than clamping to today', () => {
    expect(seriesOfferDue(28, TRIP_START, '2026-10-24')).toEqual({
      text: 'overdue',
      overdue: true,
    })
  })

  it('has no due day while the trip has no start, or the task no lead', () => {
    const undated = { text: 'no due day', overdue: false }
    expect(seriesOfferDue(7, null, '2026-10-05')).toEqual(undated)
    expect(seriesOfferDue(null, TRIP_START, '2026-10-05')).toEqual(undated)
  })
})
