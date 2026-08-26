// @vitest-environment jsdom
/**
 * The harness under `jsdom` — the rule the whole module exists for.
 *
 * jsdom supplies a real `Storage`. Replacing it with a Map is what hid the
 * Node 26 breakage: the spec then asserts against the stub instead of
 * against the environment it declared. So the harness leaves it alone and
 * only empties it.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { installHarness } from './harness'

beforeEach(() => {
  installHarness()
})

describe('installHarness under jsdom', () => {
  it('leaves the real Storage in place instead of shadowing it', () => {
    expect(localStorage).toBe(window.localStorage)
    // The Map stub carries no `Storage` prototype; the real one does.
    expect(Object.getPrototypeOf(localStorage)).toBe(Storage.prototype)
  })

  it('still empties it between tests, so the isolation is not lost', () => {
    expect(localStorage.length).toBe(0)
    localStorage.setItem('k', 'v')
    expect(localStorage.length).toBe(1)
  })
})
