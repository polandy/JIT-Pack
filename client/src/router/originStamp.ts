import { enteredFrom, originFrom } from './backTarget'
import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router'

/**
 * Origin stamping for the fifth route class (Navigation_Concept §7).
 *
 * A route that `acceptsFrom` returns to where it was entered from, which
 * means something has to record that. Doing it at every link would work
 * until the next link forgets — the settings gear is offered on every
 * screen and the two import flows are already entered from five places.
 * So the router stamps it: any navigation *into* such a route that
 * carries no origin gets the path it came from, once, as a redirect that
 * replaces rather than appends.
 */

/** The slice of a route the stamp decision needs. */
export interface StampableRoute {
  path: string
  fullPath: string
  hash: string
  query: Record<string, string | null | (string | null)[] | undefined>
  meta: { acceptsFrom?: boolean }
  matched: unknown[]
}

/** Whether a path matches a route in this app. */
export type PathResolver = (path: string) => boolean

/**
 * stampOrigin returns the location to redirect to so the target carries
 * its origin, or null when the navigation should proceed untouched.
 *
 * Untouched covers three cases that all mean "there is no honest origin
 * to record": the target does not declare the class, it already carries
 * one (which is also what stops the redirect from looping), or there is
 * nothing to come back to — a cold start, where `from` matched no route.
 * That last case is the deep link ADR-011 exists for, and it is exactly
 * when the declared `meta.parent` has to answer instead.
 */
export function stampOrigin(
  to: StampableRoute,
  from: StampableRoute,
  resolves: PathResolver,
): RouteLocationRaw | null {
  if (!to.meta.acceptsFrom) return null
  if (from.matched.length === 0) return null
  if (from.path === to.path) return null

  // An origin that names no route of this app is not an origin: `‹` would
  // navigate to a path that renders nothing, and the URL it came from was
  // written by whoever sent the link. Replacing it is safer than keeping
  // it and safer than dropping the parameter, which would strand the user
  // on the declared parent when a real origin exists.
  const carried = originFrom(to.query)
  if (carried && resolves(carried)) return null

  return {
    path: to.path,
    hash: to.hash,
    query: { ...to.query, ...enteredFrom(from.fullPath) },
    replace: true,
  }
}

/**
 * installOriginStamp wires stampOrigin into a router as a global guard,
 * resolving a carried origin against that router's own route table.
 */
export function installOriginStamp(router: Router): void {
  const resolves: PathResolver = (path) => {
    try {
      return router.resolve(path).matched.length > 0
    } catch {
      // resolve throws on a path it cannot parse at all.
      return false
    }
  }

  router.beforeEach(
    (to: RouteLocationNormalized, from: RouteLocationNormalized) =>
      stampOrigin(to as unknown as StampableRoute, from as unknown as StampableRoute, resolves) ??
      true,
  )
}
