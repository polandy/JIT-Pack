// @vitest-environment jsdom
/**
 * FR-25.4a: how an item is obtained is one vocabulary. Seven views used to
 * spell the mapping themselves, and the dense-list rule — 🧳 stays silent —
 * was the part that differed between them.
 */
import { bagHandleOutline, cartOutline, locationOutline } from 'ionicons/icons'
import { describe, expect, it, afterAll } from 'vitest'

import { setLocale } from '@/i18n'
import { MODE_KEYS, modeIcon, modeLabel } from '../modeLabels'

afterAll(() => setLocale('en'))

describe('modeLabel', () => {
  it('names every mode an item can be in', () => {
    expect(Object.keys(MODE_KEYS).sort()).toEqual(['buy_before', 'buy_local', 'pack'])
  })

  it('follows the active locale rather than the stored value', () => {
    setLocale('en')
    expect(modeLabel('buy_local')).toBe('Buy there')
    setLocale('de')
    expect(modeLabel('buy_local')).toBe('Vor Ort kaufen')
  })

  it('falls back to the raw value for a mode no catalogue knows', () => {
    setLocale('en')
    expect(modeLabel('borrow')).toBe('borrow')
  })
})

describe('modeIcon', () => {
  const cases: Array<[string, { silentPack?: boolean }, string | null]> = [
    ['buy_before', {}, cartOutline],
    ['buy_before', { silentPack: true }, cartOutline],
    ['buy_local', {}, locationOutline],
    ['buy_local', { silentPack: true }, locationOutline],
    ['pack', {}, bagHandleOutline],
    ['pack', { silentPack: true }, null],
    ['borrow', { silentPack: true }, null],
  ]

  for (const [mode, options, expected] of cases) {
    it(`${mode} with silentPack=${options.silentPack ?? false}`, () => {
      expect(modeIcon(mode, options)).toBe(expected)
    })
  }
})
