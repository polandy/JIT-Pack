import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T-10 (design review 2026-09-02). `harness.ts` exists because forty-one
 * specs stood up the same globals in twenty-eight spellings; a spec that
 * stubs one of them by hand is a twenty-ninth, and nothing said so.
 *
 * The rule is deliberately about `fetch` and `WebSocket` only. `localStorage`
 * is the documented exception: the harness stubs it **under `node` alone**,
 * because replacing jsdom's real implementation means asserting against the
 * stub instead of the environment the spec declared — so a spec that needs a
 * storage which throws, or a `jsdom` spec that wants the real one, is doing
 * the right thing by not going through the harness.
 *
 * A bespoke stub is still allowed — a constructible `WebSocket` that records
 * its instances is exactly what `useWebSocket.spec.ts` needs. What it may not
 * do is *replace* the setup: `installHarness()` first, then override, which
 * is what CLAUDE.md's Testing section already prescribes.
 */

/** The globals the harness owns outright. */
const OWNED = ['fetch', 'WebSocket']

const specs = globSync('src/**/__tests__/*.spec.ts', { cwd: process.cwd() })
  .map((path) => path.replace(/\\/g, '/'))
  .filter((path) => !path.endsWith('harness.ts'))
  .map((path) => ({ path, source: readFileSync(resolve(process.cwd(), path), 'utf8') }))

describe('the unit suite takes its globals from one harness', () => {
  it('finds the specs to check at all', () => {
    // A glob that matches nothing would make the rule below vacuous.
    expect(specs.length).toBeGreaterThan(100)
  })

  it('leaves no spec standing up fetch or WebSocket without the harness', () => {
    const offenders = specs
      .filter(({ source }) => OWNED.some((name) => source.includes(`vi.stubGlobal('${name}'`)))
      .filter(({ source }) => !source.includes('installHarness('))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })
})
