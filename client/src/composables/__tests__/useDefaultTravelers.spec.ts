// @vitest-environment jsdom
/**
 * FR-2.5a — the people who come along by default.
 *
 * The rules are all about not producing a broken trip: a blank name would
 * block M3's step 2, and a duplicate would create two travelers with one
 * name, which every per-person row then has to disambiguate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultTravelers } from '../useDefaultTravelers'

beforeEach(() => {
  localStorage.clear()
  defaultTravelers().set([])
})

describe('defaultTravelers (FR-2.5a)', () => {
  it('persists across a fresh read of the setting', () => {
    defaultTravelers().set(['Andy', 'Sia', 'Leonardo'])

    expect(JSON.parse(localStorage.getItem('jitpack_default_travelers') ?? '[]')).toEqual([
      { name: 'Andy', userId: null },
      { name: 'Sia', userId: null },
      { name: 'Leonardo', userId: null },
    ])
  })

  it('shares one list across callers, so settings and the wizard cannot disagree', () => {
    defaultTravelers().add('Andy')

    expect(defaultTravelers().names.value).toEqual(['Andy'])
  })

  it('removes by position, since two people may not share a name anyway', () => {
    const store = defaultTravelers()
    store.set(['Andy', 'Sia', 'Leonardo'])

    store.remove(1)

    expect(store.names.value).toEqual(['Andy', 'Leonardo'])
  })

  it('survives storage that refuses to write', () => {
    const store = defaultTravelers()
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    store.set(['Andy'])

    expect(store.names.value).toEqual(['Andy'])
    refuse.mockRestore()
  })
})

describe('linked accounts (FR-2.5a, FR-1.9)', () => {
  it('keeps the account a default traveller was picked from', () => {
    defaultTravelers().add('Sia', 'u-sia')

    expect(defaultTravelers().entries.value).toEqual([{ name: 'Sia', userId: 'u-sia' }])
  })

  it('drops a second entry for one account, because one account is one person', () => {
    defaultTravelers().add('Sia', 'u-sia')
    defaultTravelers().add('Sia Two', 'u-sia')

    expect(defaultTravelers().names.value).toEqual(['Sia'])
  })

  it('still reads a list stored as plain names before accounts existed', () => {
    localStorage.setItem('jitpack_default_travelers', JSON.stringify(['Andy']))
    vi.resetModules()

    return import('../useDefaultTravelers').then((m) => {
      expect(m.defaultTravelers().entries.value).toEqual([{ name: 'Andy', userId: null }])
    })
  })
})
