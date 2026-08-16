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
     * A route parameter that opens an overlay on this same route — M5's
     * sheet over the packing list. While it is present, `‹ back` closes
     * the overlay instead of leaving the screen, which is what a user
     * means by "back" with a sheet open in front of them.
     */
    overlayParam?: string
    /** Where back leads while `overlayParam` is present. */
    overlayParent?: string
    /** Static header title. Data-dependent titles use setHeaderTitle. */
    title?: string
  }
}

/** The slice of a resolved route this module needs. */
export interface BackTargetRoute {
  meta: { parent?: string; overlayParam?: string; overlayParent?: string }
  params: Record<string, string | string[]>
}

/**
 * backTarget resolves the parent path for a route, or null when the
 * route is a root — the four tab anchors and the pre-app screens, where
 * the header shows the logo instead of a back chevron.
 */
export function backTarget(route: BackTargetRoute): string | null {
  const overlay = route.meta.overlayParam
  const pattern = overlay && route.params[overlay] ? route.meta.overlayParent : route.meta.parent
  if (!pattern) return null

  return pattern.replace(/:([A-Za-z0-9_]+)/g, (whole, name: string) => {
    const value = route.params[name]
    const single = Array.isArray(value) ? value[0] : value
    // An unfilled parameter would produce a path that routes nowhere;
    // leaving the literal ':tripId' in place is louder than a 404.
    return single ?? whole
  })
}
