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
  query: Record<string, string | string[] | null | undefined>
  meta: { acceptsFrom?: boolean }
  matched: unknown[]
}

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
): RouteLocationRaw | null {
  if (!to.meta.acceptsFrom) return null
  if (originFrom(to.query)) return null
  if (from.matched.length === 0) return null
  if (from.path === to.path) return null

  return {
    path: to.path,
    query: { ...to.query, ...enteredFrom(from.fullPath) },
    replace: true,
  }
}

/** installOriginStamp wires stampOrigin into a router as a global guard. */
export function installOriginStamp(router: Router): void {
  router.beforeEach((to: RouteLocationNormalized, from: RouteLocationNormalized) =>
    stampOrigin(to as unknown as StampableRoute, from as unknown as StampableRoute) ?? true,
  )
}
