/**
 * Internationalization (NFR-4.12): English is the primary/default locale,
 * German is fully supported. The choice is device-local (same localStorage
 * pattern as the theme, FR-21.3) and falls back to the browser locale only
 * when nothing is persisted. Date/number formatting is delegated to Intl.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { de } from '../messages/de'
import {
  LOCALE_STORAGE_KEY,
  type Locale,
  currentLocale,
  formatDate,
  formatNumber,
  initLocale,
  resolveLocale,
  setLocale,
  t,
} from '../index'

let storage: Map<string, string>

function stubNavigatorLanguages(languages: string[]): void {
  vi.stubGlobal('navigator', { ...globalThis.navigator, languages })
}

beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
  stubNavigatorLanguages(['en-GB'])
  setLocale('en')
})

describe('resolveLocale', () => {
  const cases: {
    name: string
    raw: string | null
    languages: string[]
    want: Locale
  }[] = [
    { name: 'persisted German wins', raw: 'de', languages: ['en-GB'], want: 'de' },
    {
      name: 'persisted English wins over a German browser',
      raw: 'en',
      languages: ['de-CH'],
      want: 'en',
    },
    {
      name: 'nothing persisted + German browser → German',
      raw: null,
      languages: ['de-CH', 'de'],
      want: 'de',
    },
    {
      name: 'nothing persisted + other browser locale → English default',
      raw: null,
      languages: ['fr-FR'],
      want: 'en',
    },
    {
      name: 'nothing persisted + no browser hint → English default',
      raw: null,
      languages: [],
      want: 'en',
    },
    {
      name: 'unsupported persisted value → browser hint',
      raw: 'fr',
      languages: ['de'],
      want: 'de',
    },
  ]

  it.each(cases)('$name', ({ raw, languages, want }) => {
    stubNavigatorLanguages(languages)
    expect(resolveLocale(raw)).toBe(want)
  })
})

describe('t', () => {
  it('returns the English message by default', () => {
    expect(t('common.cancel')).toBe('Cancel')
  })

  it('returns the German message once German is active', () => {
    setLocale('de')
    expect(t('common.cancel')).toBe('Abbrechen')
  })

  it('interpolates named parameters', () => {
    expect(t('trip.daysUntil', { n: 2 })).toContain('2')
  })

  it('picks the singular form for n === 1 (one | other)', () => {
    expect(t('packing.itemsLeft', { n: 1 })).toBe('1 item left')
  })

  it('picks the plural form for n !== 1', () => {
    expect(t('packing.itemsLeft', { n: 4 })).toBe('4 items left')
  })

  it('uses the plural form for zero, matching English usage', () => {
    expect(t('packing.itemsLeft', { n: 0 })).toBe('0 items left')
  })

  it('pluralizes German independently of English', () => {
    setLocale('de')
    expect(t('packing.itemsLeft', { n: 1 })).toBe('1 Sache offen')
    expect(t('packing.itemsLeft', { n: 4 })).toBe('4 Sachen offen')
  })

  it('returns the key itself for an unknown key, so the UI never renders blank', () => {
    // @ts-expect-error deliberately probing a key no catalogue defines
    expect(t('nope.not.here')).toBe('nope.not.here')
  })

  it('falls back to English while German is active when a key is untranslated', () => {
    setLocale('de')
    // Simulates a key that shipped in en.ts before de.ts caught up. The
    // catalogue-integrity test keeps that from happening for real, so the
    // gap has to be injected to prove the fallback path works at all.
    const german = de as Record<string, string>
    const original = german['common.cancel'] ?? ''
    delete german['common.cancel']
    try {
      expect(t('common.cancel')).toBe('Cancel')
    } finally {
      german['common.cancel'] = original
    }
  })

  it('leaves an unmatched placeholder untouched rather than printing undefined', () => {
    expect(t('trip.daysUntil', {})).toContain('{n}')
  })
})

describe('setLocale / initLocale', () => {
  it('persists the choice device-local', () => {
    setLocale('de')
    expect(storage.get(LOCALE_STORAGE_KEY)).toBe('de')
  })

  it('reflects the choice in currentLocale', () => {
    setLocale('de')
    expect(currentLocale()).toBe('de')
  })

  it('tags the document element so the browser hyphenates and reads correctly', () => {
    setLocale('de')
    expect(document.documentElement.lang).toBe('de')
  })

  it('survives unavailable storage (private mode) by still applying the locale', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(() => setLocale('de')).not.toThrow()
    expect(currentLocale()).toBe('de')
  })

  it('applies the persisted locale at boot', () => {
    storage.set(LOCALE_STORAGE_KEY, 'de')
    expect(initLocale()).toBe('de')
    expect(t('common.cancel')).toBe('Abbrechen')
  })
})

describe('Intl formatting follows the active locale', () => {
  it('formats numbers with the locale separator', () => {
    setLocale('en')
    const english = formatNumber(1234.5)
    setLocale('de')
    const german = formatNumber(1234.5)
    expect(english).not.toBe(german)
    expect(german).toContain(',')
  })

  it('formats dates per locale', () => {
    const day = new Date('2026-03-09T12:00:00Z')
    setLocale('en')
    const english = formatDate(day)
    setLocale('de')
    const german = formatDate(day)
    expect(english).not.toBe(german)
  })
})

describe('catalogue integrity', () => {
  it('defines every English key in German too, so no screen falls back silently', async () => {
    const { en } = await import('../messages/en')
    const { de } = await import('../messages/de')
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort())
  })

  /**
   * Key parity alone is not structural parity. A translation that drops a
   * `{name}` slot silently loses the only variable part of the sentence, and
   * one that drops the ' | ' plural split makes `t()` return the singular for
   * every count — both render as plausible text, so neither shows up as a
   * missing string. These two checks are what make the German half of a
   * screen reviewable without reading it against the English one.
   */
  it('gives every message the same {placeholder} set in both catalogues', async () => {
    const { en } = await import('../messages/en')
    const { de } = await import('../messages/de')
    const slots = (message: string) => [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    const mismatched = Object.entries(en).filter(([key, english]) => {
      const german = (de as Record<string, string>)[key] ?? ''
      return String(slots(english)) !== String(slots(german))
    })
    expect(mismatched.map(([key]) => key)).toEqual([])
  })

  it('keeps the singular | plural split on both sides of a pluralized message', async () => {
    const { en } = await import('../messages/en')
    const { de } = await import('../messages/de')
    const forms = (message: string) => message.split(' | ').length
    const mismatched = Object.entries(en).filter(
      ([key, english]) => forms(english) !== forms((de as Record<string, string>)[key] ?? ''),
    )
    expect(mismatched.map(([key]) => key)).toEqual([])
  })
})
