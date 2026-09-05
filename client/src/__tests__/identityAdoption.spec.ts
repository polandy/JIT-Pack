/**
 * U-10 / ADR-047 — identity is read through the session-wide store, and a
 * screen never fetches it for itself.
 *
 * Asserted over the *source*, the `tripScreenAdoption.spec.ts` idiom, and for
 * the same reason: the rule was written into nine screens and its violation is
 * an *addition* that each screen makes plausibly and alone. A view that calls
 * `orchestrator.fetchUsers()` again is not wrong on its own screen — it is
 * wrong because eight others do not.
 */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

/** The two calls that must not be made from a view. */
const DIRECT_CALLS = /\.fetchUsers\(|\.fetchMe\(/

const views = globSync('src/views/**/*.vue', { cwd: process.cwd() }).map((path) => ({
  path: path.replace(/\\/g, '/'),
  source: readFileSync(resolve(process.cwd(), path), 'utf8'),
}))

describe('identity is one read per session', () => {
  it('is measured against the views that exist', () => {
    expect(views.length).toBeGreaterThanOrEqual(15)
  })

  it('is never fetched by a view itself', () => {
    const offenders = views.filter(({ source }) => DIRECT_CALLS.test(source)).map((v) => v.path)

    expect(offenders).toEqual([])
  })

  /*
   * The positive half. Without it the clause above is satisfied by a build in
   * which no screen reads identity at all — the same shape as an empty grep
   * passing for coverage.
   */
  it('is read through the shared composable by the screens that name somebody', () => {
    const readers = views
      .filter(({ source }) => /useIdentity\(|useTripIdentity\(/.test(source))
      .map((v) => v.path)

    expect(readers.length).toBeGreaterThanOrEqual(8)
  })
})
