// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, setLocale } from '@/i18n'
import { changesChip } from '../refreshWording'

describe('changesChip — M2 names a trip’s group changes in one chip (FR-27.4, UX-20)', () => {
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it('counts every change and names the open ones apart when both are there', () => {
    setLocale('de')
    expect(changesChip(11, 1)).toEqual({ total: '⟳ 12 Änderungen', open: '1 offen' })
  })

  it('says „übernommen" when nothing is waiting', () => {
    setLocale('de')
    expect(changesChip(11, 0)).toEqual({ total: '⟳ 11 Änderungen übernommen', open: null })
    expect(changesChip(1, 0)).toEqual({ total: '⟳ 1 Änderung übernommen', open: null })
  })

  it('names only what is open when nothing was taken over yet, as the open part', () => {
    setLocale('de')
    expect(changesChip(0, 1)).toEqual({ total: null, open: '⟳ 1 Änderung offen' })
    expect(changesChip(0, 3)).toEqual({ total: null, open: '⟳ 3 Änderungen offen' })
  })

  it('has nothing to say when there is nothing to name', () => {
    expect(changesChip(0, 0)).toBeNull()
  })

  it('reads in English too', () => {
    setLocale('en')
    expect(changesChip(11, 1)).toEqual({ total: '⟳ 12 changes', open: '1 open' })
    expect(changesChip(1, 0)).toEqual({ total: '⟳ 1 change taken over', open: null })
  })
})
