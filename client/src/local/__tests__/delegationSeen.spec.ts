// @vitest-environment jsdom
/**
 * FR-6.1 — the device-local record of which delegations have been shown.
 *
 * jsdom because the subject *is* `localStorage`: under `node` the harness
 * stubs it, and the spec would assert against the stub rather than against the
 * environment it declares.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { loadSeenDelegations, markDelegationsSeen } from '../delegationSeen'

describe('delegationSeen (FR-6.1)', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty, so every delegation on a fresh device is new', () => {
    expect(loadSeenDelegations().size).toBe(0)
  })

  it('remembers what was shown', () => {
    markDelegationsSeen(['a', 'b'])
    expect([...loadSeenDelegations()].sort()).toEqual(['a', 'b'])
  })

  /**
   * Replacing rather than adding is the whole reason the store stays small —
   * and it is also what makes a re-delegation visible again.
   */
  it('forgets a row that is no longer delegated to me', () => {
    markDelegationsSeen(['a', 'b'])
    markDelegationsSeen(['b'])
    expect([...loadSeenDelegations()]).toEqual(['b'])
  })

  it('reads an unreadable store as empty rather than throwing', () => {
    localStorage.setItem('jitpack_delegation_seen', 'not json')
    expect(loadSeenDelegations().size).toBe(0)
  })
})
