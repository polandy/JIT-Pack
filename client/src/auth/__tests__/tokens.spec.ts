// @vitest-environment jsdom
/**
 * `subjectOf` is how a device in Server Mode learns which account it is
 * (FR-5.7): the claim rules ask it whether a row's holder is somebody else.
 * It is the *default* source of that answer in the running app, so the
 * malformed cases matter as much as the good one — each of them must
 * answer "no account", never throw into a render.
 */
import { describe, it, expect } from 'vitest'

import { subjectOf } from '../tokens'

/** A session token shaped the way the server writes one (auth.go). */
function token(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims))}.signature`
}

describe('subjectOf', () => {
  it('reads the account id out of a session token', () => {
    expect(subjectOf(token({ sub: 'user-7', exp: 1 }))).toBe('user-7')
  })

  it('answers null where there is no session at all', () => {
    expect(subjectOf(null)).toBeNull()
  })

  it('answers null rather than throwing on a token it cannot read', () => {
    expect(subjectOf('not-a-jwt')).toBeNull()
    expect(subjectOf('header.@@notbase64@@.sig')).toBeNull()
    expect(subjectOf(token({ exp: 1 }))).toBeNull()
    expect(subjectOf(token({ sub: 42 }))).toBeNull()
  })
})
