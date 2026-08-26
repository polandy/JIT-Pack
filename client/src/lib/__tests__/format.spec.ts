// @vitest-environment jsdom
/**
 * Shared display formatting (UX-5/UX-11, 2026-08-25 UX review): dates were
 * interpolated as raw ISO strings on every trip surface, and the analytics
 * value KPI was a bare `toFixed(2)`. One locale-aware helper per fact, used
 * everywhere that fact is shown.
 *
 * jsdom: `setLocale` persists to localStorage and stamps `document.documentElement.lang`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { setLocale } from '@/i18n'

import { formatTripPeriod, formatValue, formatWeight } from '../format'

// The active locale is module state; every test names its own.
beforeEach(() => localStorage.clear())
afterEach(() => setLocale('en'))

/** Collapses the assorted Unicode spaces Intl may emit, so assertions survive ICU updates. */
const plain = (s: string) => s.replace(/\s+/g, ' ')

describe('formatTripPeriod (M1/M2/M16, UX-5)', () => {
  const dated = { year: 2026, start_date: '2026-08-22', end_date: '2026-09-05' }

  it('renders a same-year range collapsed, de style', () => {
    setLocale('de')
    expect(plain(formatTripPeriod(dated))).toBe('22.08. – 05.09.2026')
  })

  it('renders the range with short months in English', () => {
    setLocale('en')
    expect(plain(formatTripPeriod(dated))).toBe('Aug 22 – Sep 5, 2026')
  })

  it('renders a cross-year range with both years', () => {
    setLocale('de')
    expect(
      plain(formatTripPeriod({ year: 2026, start_date: '2026-12-28', end_date: '2027-01-03' })),
    ).toBe('28.12.2026 – 03.01.2027')
  })

  it('an end date alone reads as "until"', () => {
    setLocale('de')
    expect(formatTripPeriod({ year: 2026, start_date: null, end_date: '2026-12-31' })).toBe(
      'bis 31.12.2026',
    )
    setLocale('en')
    expect(formatTripPeriod({ year: 2026, start_date: null, end_date: '2026-12-31' })).toBe(
      'until Dec 31, 2026',
    )
  })

  it('a start date alone reads as "from"', () => {
    setLocale('en')
    expect(formatTripPeriod({ year: 2026, start_date: '2026-08-22', end_date: null })).toBe(
      'from Aug 22, 2026',
    )
  })

  it('a year-only trip is named by its year, never by a fabricated date (UX-5)', () => {
    setLocale('de')
    expect(formatTripPeriod({ year: 2016, start_date: null, end_date: null })).toBe('2016')
  })
})

describe('formatValue (M11/M9, UX-11)', () => {
  it('renders cents as a two-decimal amount in the active locale', () => {
    setLocale('en')
    expect(formatValue(123450)).toBe('1,234.50')
    setLocale('de')
    // Plain 'de' resolves to de-DE conventions in tests (no de-CH browser
    // tag around); the point is the locale decides, not toFixed.
    expect(formatValue(1050)).toBe('10,50')
  })
})

describe('formatWeight', () => {
  it('keeps its gram/kilogram split', () => {
    expect(formatWeight(850)).toBe('850 g')
    expect(formatWeight(1200)).toBe('1.2 kg')
  })
})
