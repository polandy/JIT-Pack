/**
 * The 4xx classification, pinned as a table (ADR-059).
 *
 * Two callers ask this question and must not answer it differently: the
 * refresher deciding whether a session is over, and the outbox deciding
 * whether a refused push can be retried. They act differently on 401, which
 * is correct (the outbox refreshes and retries; the refresher *is* the
 * refresh) — the table classifies it once and leaves the next step to each.
 */
import { describe, it, expect } from 'vitest'

import { isClientError, isTransientClientStatus } from '../status'

describe('isTransientClientStatus', () => {
  it.each([
    [408, true, 'the server gave up waiting for the body'],
    [425, true, 'it was sent too early'],
    [429, true, 'this client is being rate-limited'],
    [400, false, 'the request itself is wrong'],
    [401, false, 'a verdict on the credentials, whatever each caller does next'],
    [403, false, 'a verdict on the permission'],
    [404, false, 'a verdict on the target'],
    [409, false, 'a verdict on the state'],
    [422, false, 'a verdict on the content'],
    [500, false, 'not a client error at all'],
  ])('%i → %s (%s)', (status, transient) => {
    expect(isTransientClientStatus(status)).toBe(transient)
  })
})

describe('isClientError', () => {
  it.each([
    [399, false],
    [400, true],
    [451, true],
    [499, true],
    [500, false],
  ])('%i → %s', (status, inRange) => {
    expect(isClientError(status)).toBe(inRange)
  })
})
