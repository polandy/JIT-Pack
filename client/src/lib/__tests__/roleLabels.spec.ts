// @vitest-environment jsdom
/**
 * FR-4.5/4.7: the roster's role chip is a translated word, not a capitalised
 * wire value. The old rule (`charAt(0).toUpperCase()`) passed every English
 * eyeball and never changed with the language, which is exactly the kind of
 * gap NFR-4.12 exists to close.
 */
import { describe, expect, it, afterAll } from 'vitest'

import { setLocale } from '@/i18n'
import { ROLE_KEYS, roleLabel } from '../roleLabels'

afterAll(() => setLocale('en'))

describe('roleLabel', () => {
  it('names every role the roster can hold', () => {
    expect(Object.keys(ROLE_KEYS).sort()).toEqual(['admin', 'editor', 'owner'])
  })

  it('follows the active locale rather than the stored value', () => {
    setLocale('en')
    expect(roleLabel('editor')).toBe('Editor')
    setLocale('de')
    expect(roleLabel('editor')).toBe('Bearbeiter:in')
  })

  it('falls back to the raw value for a role no catalogue knows', () => {
    setLocale('en')
    expect(roleLabel('viewer')).toBe('viewer')
  })
})
