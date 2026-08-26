/**
 * The harness under the default `node` environment.
 *
 * There is no DOM here, so `localStorage` has to come from somewhere — the
 * client reads it for the device id and the token pair, and without a stub
 * every sync spec would fail on a ReferenceError rather than on its subject.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { installHarness } from './harness'

beforeEach(() => {
  installHarness()
})

describe('installHarness under node', () => {
  it('supplies a localStorage, because the environment has none', () => {
    expect(typeof window).toBe('undefined')
    localStorage.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })

  it('starts each test with an empty one', () => {
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('supplies a WebSocket that can be constructed, not only called', () => {
    // An arrow function here surfaces as an unhandled TypeError beside a
    // passing suite; `connect()` does `new WebSocket(...)`.
    expect(() => new WebSocket('ws://localhost/ws')).not.toThrow()
  })
})
