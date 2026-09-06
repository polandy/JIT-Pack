// @vitest-environment jsdom
/**
 * FR-25.4/FR-7.3: what an item's state is called, and the one case where the
 * state is not the whole answer. The table used to live inline in M5 behind a
 * cast, so nothing checked either side of it.
 */
import { describe, expect, it, afterAll } from 'vitest'

import { setLocale } from '@/i18n'
import type { ItemState } from '@/types/domain'
import { STATE_KEYS, stateLabel } from '../stateLabels'

afterAll(() => setLocale('en'))

describe('stateLabel', () => {
  it('names every state an item can be in', () => {
    expect(Object.keys(STATE_KEYS).sort()).toEqual([
      'open',
      'packed',
      'packing_now',
      'partial',
      'skipped',
    ])
  })

  it.each<[ItemState, string, string]>([
    ['open', 'open', 'offen'],
    ['partial', 'partly packed', 'teilweise'],
    ['packed', 'packed', 'gepackt'],
    ['skipped', 'skipped', 'weggelassen'],
    ['packing_now', 'packing now', 'wird gepackt'],
  ])('reads %s from the active locale', (state, english, german) => {
    setLocale('en')
    expect(stateLabel(state)).toBe(english)
    setLocale('de')
    expect(stateLabel(state)).toBe(german)
  })

  it('says the prep is open instead, because that outranks being packed (FR-7.3)', () => {
    setLocale('en')
    expect(stateLabel('packed', { prepOpen: true })).toBe('packed · prep open')
    expect(stateLabel('packed')).toBe('packed')
  })

  it('lets the prep exception speak for a row that is not packed at all', () => {
    // The caller decides when it applies — M5 only raises the flag for a
    // packed row — so the function must not second-guess it.
    setLocale('en')
    expect(stateLabel('open', { prepOpen: true })).toBe('packed · prep open')
  })
})
