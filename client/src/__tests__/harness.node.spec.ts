/**
 * The harness under the default `node` environment.
 *
 * There is no DOM here, so `localStorage` has to come from somewhere — the
 * client reads it for the device id and the token pair, and without a stub
 * every sync spec would fail on a ReferenceError rather than on its subject.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

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

/**
 * The guard on `unstubGlobals` in `vitest.config.ts`. Without that flag a
 * `vi.stubGlobal` inside one test reaches every later test in the file, and
 * the leak is invisible for as long as some `beforeEach` happens to install
 * a fresh stub over it — so nothing else here would go red if it were turned
 * off. These two cases run in declaration order and assert across the seam.
 */
declare global {
  // eslint-disable-next-line no-var
  var __leakProbe: string | undefined
}

describe('a stub does not outlive the test that installed it', () => {
  it('sees the stub it installs', () => {
    vi.stubGlobal('__leakProbe', 'installed')
    expect(globalThis.__leakProbe).toBe('installed')
  })

  it('does not inherit the stub the previous test installed', () => {
    expect(globalThis.__leakProbe).toBeUndefined()
  })
})
