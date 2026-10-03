import type { Router } from 'vue-router'

/** The path the current history entry was pushed from, as vue-router's web history records it. */
function backEntry(): unknown {
  return (window.history.state as { back?: unknown } | null)?.back
}

/**
 * Leaves a sheet opened by a pushed query for `here`, the same page without
 * it: a step back when the sheet was pushed from there (so the browser's back
 * does not reopen it), a replace otherwise. Resolves once the route has
 * arrived — `router.back()` lands on a later popstate, and a navigation
 * started before that would be undone by it.
 */
export function closeOverlayRoute(
  router: Router,
  here: string,
  previous: unknown = backEntry(),
): Promise<unknown> {
  if (previous !== here) return router.replace(here)
  const arrived = new Promise<void>((resolve) => {
    const stop = router.afterEach(() => {
      stop()
      resolve()
    })
  })
  router.back()
  return arrived
}
