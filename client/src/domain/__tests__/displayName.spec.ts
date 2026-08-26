import { describe, expect, it } from 'vitest'

import { isValidDisplayName } from '../displayName'

// FR-17.13: 1–50 printable characters, no leading or trailing whitespace.
// The rule must accept every name the system itself hands out — the
// seeded "Demo User" and IdP-sourced names with spaces or diacritics —
// mirroring the server's rule in internal/store/singleuser.go.
describe('isValidDisplayName (FR-17.13)', () => {
  it.each([
    ['Andy_Pollari-99', true],
    ['a'.repeat(50), true],
    ['a'.repeat(51), false],
    ['Demo User', true],
    ['Béatrice Müller', true],
    ['', false],
    [' Andy', false],
    ['Andy ', false],
    ['   ', false],
    ['Andy\tPollari', false],
    ['a', true],
  ])('%j → %s', (name, valid) => {
    expect(isValidDisplayName(name)).toBe(valid)
  })
})
