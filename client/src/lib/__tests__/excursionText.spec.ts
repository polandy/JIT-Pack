// @vitest-environment jsdom
/** FR-31.10 — an excursion's days in words: one day, or a span, with the weekday. */
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, setLocale } from '@/i18n'
import { excursionDays } from '../excursionText'

describe('excursionDays', () => {
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it('says one day once and a span from–to, and nothing for an undated excursion', () => {
    setLocale('de')
    expect(excursionDays({ from: '2026-07-14', to: '2026-07-14' })).toBe('Di., 14.7.')
    expect(excursionDays({ from: '2026-07-16', to: '2026-07-17' })).toBe('Do., 16.7. – Fr., 17.7.')
    expect(excursionDays(null)).toBeNull()
  })
})
