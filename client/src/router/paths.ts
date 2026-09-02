/**
 * Every path the app navigates to, built in one place.
 *
 * The route table names 27 routes and nothing used the names: navigation
 * was written as `` `/trips/${id}/review` `` at some thirty call sites, in
 * `router-link` attributes and in `meta.parent` alike. A path shape that is
 * spelled at thirty places is a shape nothing can change — and the one
 * defect it already caused is recorded in `PortableImportPage.vue:120`,
 * where `/trips` was pushed to a router that only knows `/trips/new` and
 * `/trips/:tripId`, so the replace matched nothing and the user was left
 * where they were.
 *
 * Route *names* were the other candidate and are not used, for two
 * reasons: `router-link` and `ionRouter.navigate` take a path, and the
 * back-target contract (`meta.parent`, ADR-011) is a path pattern that has
 * to be filled from params — a name cannot express it. A builder gives the
 * same single declaration without changing what the router consumes.
 *
 * Kept free of imports on purpose: `client/e2e/routes.ts` re-exports this
 * module so the suite navigates by the same builders (T-11), and the
 * Playwright side compiles it without the `@/` alias.
 */

/** The paths that carry no parameter, keyed by what the screen is. */
export const PATH = {
  dashboard: '/tabs/dashboard',
  trips: '/tabs/trips',
  templates: '/tabs/templates',
  items: '/tabs/items',
  settings: '/tabs/settings',
  login: '/login',
  authCallback: '/auth/callback',
  newTrip: '/trips/new',
  newItem: '/items/new',
  importSpreadsheet: '/import',
  importFile: '/portable-import',
  masterConflicts: '/master/conflicts',
  masterRetired: '/master/retired',
  admin: '/admin',
  devGallery: '/dev/gallery',
} as const

/**
 * The route parameters, as the router spells them. A path pattern in the
 * route table is the same builder called with these — so a renamed
 * parameter cannot leave `meta.parent` pointing at the old spelling.
 */
export const TRIP_ID_PARAM = ':tripId'
export const ITEM_ID_PARAM = ':itemId'
export const TEMPLATE_ID_PARAM = ':templateId'
export const SERIES_ID_PARAM = ':seriesId'

/** M4's sub-screens; the union is what stops a typo becoming a 404. */
export type TripSubScreen =
  | 'edit'
  | 'clone'
  | 'review'
  | 'template'
  | 'analytics'
  | 'containers'
  | 'conflicts'
  | 'members'
  | 'shopping'

/** The packing list (M4). */
export function tripPath(tripId: string): string {
  return `/trips/${tripId}`
}

/** One of the trip's own screens — M4's drill-downs and M14/M15/M16. */
export function tripSubPath(tripId: string, screen: TripSubScreen): string {
  return `${tripPath(tripId)}/${screen}`
}

/** The item sheet over the packing list (M5) — an alias of the trip route. */
export function tripItemPath(tripId: string, itemId: string): string {
  return `${tripPath(tripId)}/items/${itemId}`
}

/** The template editor (M8). */
export function templatePath(templateId: string): string {
  return `/templates/${templateId}`
}

/** The inventory item editor (M10). */
export function itemPath(itemId: string): string {
  return `/items/${itemId}`
}

/** A trip series' profile (M20). */
export function seriesPath(seriesId: string): string {
  return `/series/${seriesId}`
}
