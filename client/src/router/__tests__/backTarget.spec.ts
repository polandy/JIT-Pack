import { describe, expect, it } from 'vitest'
import { ORIGIN_QUERY_PARAM, backTarget, enteredFrom, originFrom } from '@/router/backTarget'
import { routes } from '@/router'

/**
 * ADR-011 / Navigation_Concept §7. Two things are under test: the
 * resolution itself, and the contract that every non-root route
 * actually declares a parent — the second is what turns "a screen
 * without a back target" from a silent omission into a failing test.
 */

describe('backTarget', () => {
  it('returns null for a root, where the header shows the logo instead', () => {
    expect(backTarget({ meta: {}, params: {} })).toBeNull()
  })

  it('resolves a static parent', () => {
    expect(backTarget({ meta: { parent: '/tabs/trips' }, params: {} })).toBe('/tabs/trips')
  })

  it('fills the parent pattern from the current route params', () => {
    expect(backTarget({ meta: { parent: '/trips/:tripId' }, params: { tripId: 'trip-1' } })).toBe(
      '/trips/trip-1',
    )
  })

  it('fills every parameter, not only the first', () => {
    expect(
      backTarget({
        meta: { parent: '/trips/:tripId/items/:itemId' },
        params: { tripId: 't1', itemId: 'i9' },
      }),
    ).toBe('/trips/t1/items/i9')
  })

  it('takes the first value of a repeated param rather than joining it', () => {
    expect(
      backTarget({ meta: { parent: '/trips/:tripId' }, params: { tripId: ['t1', 't2'] } }),
    ).toBe('/trips/t1')
  })

  it('leaves an unfilled parameter visible instead of routing nowhere quietly', () => {
    expect(backTarget({ meta: { parent: '/trips/:tripId' }, params: {} })).toBe('/trips/:tripId')
  })
})

/** Roots show the logo; everything else owes a parent (ADR-011). */
const ROOT_PATHS = [
  '/',
  '/tabs/',
  '/tabs/dashboard',
  '/tabs/trips',
  '/tabs/templates',
  '/tabs/items',
  // Pre-app screens: no app chrome to go back to.
  '/login',
  '/auth/callback',
]

function flatten(list: typeof routes, prefix = ''): { path: string; meta?: object }[] {
  return list.flatMap((r) => {
    const path = r.path.startsWith('/') ? r.path : `${prefix}${r.path}`
    const self = r.redirect ? [] : [{ path, meta: r.meta }]
    return [...self, ...flatten(r.children ?? [], path)]
  })
}

describe('the back-target contract over the real router', () => {
  it('every non-root route declares a parent', () => {
    const missing = flatten(routes)
      .filter((r) => !ROOT_PATHS.includes(r.path))
      .filter((r) => !(r.meta as { parent?: string } | undefined)?.parent)
      .map((r) => r.path)

    expect(missing).toEqual([])
  })

  it('every root declares no parent, which is what makes it a root', () => {
    // The other half of the contract, and the half that was missing:
    // `/tabs/settings` sat on this list while the route table gave it a
    // parent, and nothing objected. An exemption that is never checked
    // is a claim, not a rule.
    const contradictory = flatten(routes)
      .filter((r) => ROOT_PATHS.includes(r.path))
      .filter((r) => (r.meta as { parent?: string } | undefined)?.parent)
      .map((r) => r.path)

    expect(contradictory).toEqual([])
  })

  it('every route that accepts an origin still declares a parent to fall back to', () => {
    const withoutFallback = flatten(routes)
      .filter((r) => (r.meta as { acceptsFrom?: boolean } | undefined)?.acceptsFrom)
      .filter((r) => !(r.meta as { parent?: string } | undefined)?.parent)
      .map((r) => r.path)

    expect(withoutFallback).toEqual([])
  })

  it('covers the routes that actually exist, so the check cannot pass vacuously', () => {
    // Positive signal: if the flattening broke, the list above would be
    // empty for the wrong reason.
    const checked = flatten(routes).filter((r) => !ROOT_PATHS.includes(r.path))
    expect(checked.length).toBeGreaterThan(10)
  })
})

/**
 * M5 opens as an overlay on the packing list's own route (UI-Spec M5), so
 * "back" has two meanings on one screen: close the sheet, or leave the
 * trip. The route says which, rather than the header guessing.
 */
describe('an overlay on the same route (UI-Spec M5)', () => {
  const tripRoute = {
    meta: {
      parent: '/tabs/trips',
      overlayParam: 'itemId',
      overlayParent: '/trips/:tripId',
    },
  }

  it('closes the overlay while it is open', () => {
    expect(backTarget({ ...tripRoute, params: { tripId: 't1', itemId: 'i9' } })).toBe('/trips/t1')
  })

  it('leaves the screen once the overlay is gone', () => {
    expect(backTarget({ ...tripRoute, params: { tripId: 't1' } })).toBe('/tabs/trips')
  })
})

/**
 * The fifth route class (Navigation_Concept §7, ADR-011 amendment): a
 * screen reachable from anywhere — the settings gear, the two import
 * flows — cannot name one parent truthfully, so it is entered with the
 * path it was entered from and returns there. The declared parent stays
 * as the fallback for a cold-start deep link, which carries no origin.
 */
describe('a route that carries its origin (ADR-011 amendment)', () => {
  const settings = { meta: { parent: '/tabs/dashboard', acceptsFrom: true }, params: {} }

  it('returns to the origin it was entered from rather than the declared parent', () => {
    expect(backTarget({ ...settings, query: enteredFrom('/trips/t1') })).toBe('/trips/t1')
  })

  it('falls back to the declared parent on a cold-start deep link', () => {
    expect(backTarget({ ...settings, query: {} })).toBe('/tabs/dashboard')
  })

  it("keeps the origin's own query, so a chain of origins unwinds hop by hop", () => {
    const nested = '/tabs/settings?from=%2Ftrips%2Ft1&tab=push'
    // Unencoded, the `&` would end the value and the hop would be lost.
    expect(backTarget({ ...settings, query: enteredFrom(nested) })).toBe(nested)
  })

  it('ignores an origin on a route that does not declare the class', () => {
    // Otherwise any drill-down could be redirected by a crafted link.
    expect(
      backTarget({
        meta: { parent: '/tabs/trips' },
        params: {},
        query: enteredFrom('/tabs/items'),
      }),
    ).toBe('/tabs/trips')
  })

  it('closes an overlay before it considers the origin', () => {
    expect(
      backTarget({
        meta: {
          parent: '/tabs/trips',
          acceptsFrom: true,
          overlayParam: 'itemId',
          overlayParent: '/trips/:tripId',
        },
        params: { tripId: 't1', itemId: 'i9' },
        query: enteredFrom('/tabs/items'),
      }),
    ).toBe('/trips/t1')
  })
})

describe('originFrom rejects what is not an internal path', () => {
  const cases: [string, unknown][] = [
    ['an absolute URL', 'https://evil.example/steal'],
    ['a protocol-relative URL', '//evil.example/steal'],
    ['a scheme', 'javascript:alert(1)'],
    ['a bare relative path', 'tabs/items'],
    ['a backslash-escaped host', '/\\evil.example'],
    ['a repeated param, which no honest link produces', ['/tabs/items', '/trips/t1']],
    ['a missing value', undefined],
  ]

  it.each(cases)('rejects %s', (_name, value) => {
    expect(originFrom({ from: value } as Record<string, string>)).toBeNull()
  })

  it('rejects a value that is not decodable at all', () => {
    expect(originFrom({ from: '%E0%A4%A' })).toBeNull()
  })

  it('accepts an ordinary internal path, so the rejections are not vacuous', () => {
    expect(originFrom(enteredFrom('/trips/t1?tab=open'))).toBe('/trips/t1?tab=open')
  })
})

describe('enteredFrom', () => {
  it('names the origin under the documented query key', () => {
    expect(enteredFrom('/trips/t1')).toEqual({ [ORIGIN_QUERY_PARAM]: '%2Ftrips%2Ft1' })
  })
})
