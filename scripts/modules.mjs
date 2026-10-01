/**
 * The feature modules (FR-30.3, ADR-066; §3.29, ADR-078) — one directory each
 * under `client/src`, and the one list every script that knows about them
 * reads: `module-boundary-gate.mjs` holds their import boundary and their e2e
 * tags, `diff-scope.mjs` decides when CI may run one of them alone (ADR-079).
 */
export const MODULES = ['shopping', 'planner']

/**
 * What in an e2e spec outside `client/e2e/<module>/` says a case works a
 * module's surface: opening its trip view, its switcher entry, its dashboard
 * card. A case that matches carries the module's tag, so CI's module-only run
 * (ADR-079) reaches it — `module-boundary-gate.mjs` holds that.
 */
export const MODULE_E2E_MARKERS = {
  shopping: [/openTripView\(\s*page,\s*'shopping'/, /trip-view-shopping/, /dashboard-shopping-/],
  planner: [
    /openTripView\(\s*page,\s*'ideas'/,
    /trip-view-ideas/,
    /openTripView\(\s*page,\s*'dayplan'/,
    /trip-view-dayplan/,
  ],
}
