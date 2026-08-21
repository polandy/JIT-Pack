import { describe, expect, it } from 'vitest'
import { stampOrigin, type StampableRoute } from '@/router/originStamp'
import { routes } from '@/router'

/**
 * ADR-011 amendment. The gear is on every screen and the import flows
 * are entered from five places, so the origin is recorded by the router
 * rather than by each link — the symptom that started this was a chevron
 * inside a trip that went to the dashboard (Navigation_Concept §7).
 */

function route(over: Partial<StampableRoute> = {}): StampableRoute {
  return {
    path: '/tabs/settings',
    fullPath: '/tabs/settings',
    query: {},
    meta: { acceptsFrom: true },
    matched: [{}],
    ...over,
  }
}

const trip = route({
  path: '/trips/t1',
  fullPath: '/trips/t1',
  meta: {},
})

describe('stampOrigin', () => {
  it('records where a global action was entered from', () => {
    expect(stampOrigin(route(), trip)).toEqual({
      path: '/tabs/settings',
      query: { from: '%2Ftrips%2Ft1' },
      replace: true,
    })
  })

  it('records the origin whole, so a chain of origins survives', () => {
    const settingsFromTrip = route({ fullPath: '/tabs/settings?from=%2Ftrips%2Ft1' })
    const admin = route({ path: '/admin', fullPath: '/admin' })

    // The nested origin's own query survives because it is encoded — an
    // unencoded `?` would be read as the end of this one.
    expect(stampOrigin(admin, settingsFromTrip)).toEqual({
      path: '/admin',
      query: { from: '%2Ftabs%2Fsettings%3Ffrom%3D%252Ftrips%252Ft1' },
      replace: true,
    })
  })

  it('keeps the query the target already carried', () => {
    const withQuery = route({ query: { tab: 'push' } })
    expect(stampOrigin(withQuery, trip)).toEqual({
      path: '/tabs/settings',
      query: { tab: 'push', from: '%2Ftrips%2Ft1' },
      replace: true,
    })
  })

  it('leaves a route that does not declare the class alone', () => {
    expect(stampOrigin(route({ meta: {} }), trip)).toBeNull()
  })

  it('does not stamp twice, which is what stops the redirect looping', () => {
    expect(stampOrigin(route({ query: { from: '%2Ftrips%2Ft1' } }), trip)).toBeNull()
  })

  it('re-stamps an origin that is not a safe internal path', () => {
    // A crafted link is not an origin, and leaving it in place would let
    // `‹ back` carry the user off the app.
    expect(stampOrigin(route({ query: { from: 'https://evil.example' } }), trip)).toEqual({
      path: '/tabs/settings',
      query: { from: '%2Ftrips%2Ft1' },
      replace: true,
    })
  })

  it('leaves a cold start unstamped, so the declared parent answers', () => {
    // vue-router's START_LOCATION matches nothing: a deep link opened
    // from a notification has no origin, which is the case ADR-011 exists
    // for.
    expect(stampOrigin(route(), route({ matched: [], path: '/', fullPath: '/' }))).toBeNull()
  })

  it('does not stamp a navigation onto the same screen', () => {
    expect(stampOrigin(route(), route())).toBeNull()
  })
})

describe('the route table declares the class where the app needs it', () => {
  function metaOf(path: string) {
    return routes.find((r) => r.path === path)?.meta as
      | { acceptsFrom?: boolean; parent?: string }
      | undefined
  }

  it.each([
    ['/tabs/settings', 'the gear is offered on every screen (G-1)'],
    ['/import', 'M15 is entered from M2 and M9'],
    ['/portable-import', 'M18 is entered from M2, M7 and Settings'],
    ['/admin', 'reached from Settings, which itself carries an origin'],
  ])('%s accepts an origin — %s', (path) => {
    expect(metaOf(path)?.acceptsFrom).toBe(true)
  })

  it('a drill-down does not, so a crafted link cannot redirect it', () => {
    expect(metaOf('/trips/:tripId')?.acceptsFrom).toBeUndefined()
    expect(metaOf('/items/:itemId')?.acceptsFrom).toBeUndefined()
  })
})
