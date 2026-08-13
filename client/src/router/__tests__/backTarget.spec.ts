import { describe, expect, it } from 'vitest'
import { backTarget } from '@/router/backTarget'
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
  '/tabs/settings',
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

  it('covers the routes that actually exist, so the check cannot pass vacuously', () => {
    // Positive signal: if the flattening broke, the list above would be
    // empty for the wrong reason.
    const checked = flatten(routes).filter((r) => !ROOT_PATHS.includes(r.path))
    expect(checked.length).toBeGreaterThan(10)
  })
})
