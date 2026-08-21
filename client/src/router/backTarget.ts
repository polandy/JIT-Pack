import type { MessageKey } from '@/i18n'

/**
 * The back-target contract (Navigation_Concept §7, ADR-011).
 *
 * With one header bar whose left slot switches, `‹ back` is the only way
 * out of a drill-down — the logo is not on screen there. So the target
 * may not be read off the history stack: a deep link opened from a
 * notification has a one-entry history and would strand the user.
 *
 * Instead every non-root route declares `meta.parent` as a path pattern,
 * and the parameters of the *current* route fill it in.
 */

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * Back-target path pattern — the parent this route returns to.
     * Absent only on roots, where the header shows the logo instead.
     */
    parent?: string
    /**
     * The fifth route class (Navigation_Concept §7): a screen reachable
     * from anywhere — the settings gear, the import flows — where no
     * single parent is true. It is entered with the path it was entered
     * from, and `‹ back` returns there; `parent` stays as the fallback
     * for the entry that carries no origin, a cold-start deep link.
     */
    acceptsFrom?: boolean
    /**
     * A route parameter that opens an overlay on this same route — M5's
     * sheet over the packing list. While it is present, `‹ back` closes
     * the overlay instead of leaving the screen, which is what a user
     * means by "back" with a sheet open in front of them.
     */
    overlayParam?: string
    /** Where back leads while `overlayParam` is present. */
    overlayParent?: string
    /**
     * Catalogue key of a static header title. A key rather than the text:
     * the header renders it through `t()`, so it follows the language
     * choice, and a route table cannot smuggle an untranslated string
     * into the one bar every screen shares. Data-dependent titles use
     * setHeaderTitle.
     */
    titleKey?: MessageKey
  }
}

/** Query key naming the path a global action or flow was entered from. */
export const ORIGIN_QUERY_PARAM = 'from'

/** The slice of a route's query this module reads. */
type OriginQuery =
  | Record<string, string | null | (string | null)[] | undefined>
  | undefined

/** The slice of a resolved route this module needs. */
export interface BackTargetRoute {
  meta: {
    parent?: string
    acceptsFrom?: boolean
    overlayParam?: string
    overlayParent?: string
  }
  params: Record<string, string | string[]>
  query?: OriginQuery
}

/**
 * originFrom reads the declared origin off a route's query, or null when
 * there is none that is safe to navigate to.
 *
 * The value reaches us through the URL, so it is attacker-controlled on
 * a link someone else wrote: only a path within this app is accepted.
 * A protocol-relative `//host` and a backslash — which some URL parsers
 * fold to `/` — would both leave the app while looking internal.
 */
export function originFrom(query: OriginQuery): string | null {
  const raw = query?.[ORIGIN_QUERY_PARAM]
  if (typeof raw !== 'string') return null

  // The origin is stored encoded, because it may carry a query of its own
  // — that is how a chain of origins unwinds hop by hop — and an
  // unencoded `?` or `&` inside a query value is read as the end of it.
  let value: string
  try {
    value = decodeURIComponent(raw)
  } catch {
    return null
  }

  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.includes('\\')) return null
  return value
}

/**
 * enteredFrom builds the query that hands a route its origin. The origin
 * is the *full* path including its own query, so an origin that itself
 * carries one unwinds hop by hop rather than collapsing to the fallback.
 */
export function enteredFrom(fullPath: string): Record<string, string> {
  return { [ORIGIN_QUERY_PARAM]: encodeURIComponent(fullPath) }
}

/**
 * backTarget resolves the back path for a route, or null when the
 * route is a root — the four tab anchors and the pre-app screens, where
 * the header shows the logo instead of a back chevron.
 */
export function backTarget(route: BackTargetRoute): string | null {
  const overlay = route.meta.overlayParam
  const overlayOpen = Boolean(overlay && route.params[overlay])

  // The origin is considered only after the overlay: with a sheet in
  // front of them, "back" means close it, wherever the screen came from.
  if (!overlayOpen && route.meta.acceptsFrom) {
    const origin = originFrom(route.query)
    if (origin) return origin
  }

  const pattern = overlayOpen ? route.meta.overlayParent : route.meta.parent
  if (!pattern) return null

  return pattern.replace(/:([A-Za-z0-9_]+)/g, (whole, name: string) => {
    const value = route.params[name]
    const single = Array.isArray(value) ? value[0] : value
    // An unfilled parameter would produce a path that routes nowhere;
    // leaving the literal ':tripId' in place is louder than a 404.
    return single ?? whole
  })
}
