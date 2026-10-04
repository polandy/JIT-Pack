/**
 * Every path the app navigates to, built in one place.
 *
 * A path shape spelled as `` `/trips/${id}/review` `` at every call site, in
 * `router-link` attributes and in `meta.parent` alike, is a shape nothing
 * can change — and a hand-spelled path can name a route that does not
 * exist: `/trips` pushed to a router that only knows `/trips/new` and
 * `/trips/:tripId` matches nothing and leaves the user where they were.
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
  inventoryCleanup: '/items/cleanup',
  inventoryActivity: '/items/activity',
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
  | 'activity'
  | 'members'
  | 'shopping'
  | 'tasks'
  | 'notes'
  | 'excursions'
  | 'ideas'
  | 'dayplan'
  | 'meals'
  | 'open'

/** The packing list (M4). */
export function tripPath(tripId: string): string {
  return `/trips/${tripId}`
}

/**
 * The trip, opened on the view its dates decide (FR-29.7) — what a tap on a
 * trip from outside it leads to. Never rendered: the router turns it into the
 * view (`router/tripOpening.ts`). A link that means the packing list itself,
 * or a view switched to inside the trip, names that view instead.
 */
export function tripOpenPath(tripId: string): string {
  return tripSubPath(tripId, 'open')
}

/** One of the trip's own screens — M4's drill-downs and M14/M15/M16. */
export function tripSubPath(tripId: string, screen: TripSubScreen): string {
  return `${tripPath(tripId)}/${screen}`
}

/**
 * The query keys that open something *on* a screen rather than a screen of
 * their own. Named here beside the path parameters because the same rule
 * holds: a route's `meta` and a builder must spell the key one way.
 */
/**
 * The item shown over the packing list (M5). A query rather than a path
 * parameter, because Ionic keeps one page per matched *path* and would
 * mount a second copy of the list for a second path (ADR-046).
 */
export const ITEM_QUERY_PARAM = 'item'
/** The comment a notification deep link (G-4) names, so M5 can scroll to and flash it. */
export const COMMENT_QUERY_PARAM = 'comment'
/**
 * Asks the packing list to open in FR-9.3's closing pass. A query for the
 * reason `?item=` is one: the pass is a mode of M4, not a screen of its own.
 */
export const CLOSING_QUERY_PARAM = 'closing'

/**
 * FR-7.16: asks the packing list to open with FR-5.10's question put for
 * *Reise starten* — the trip is being started while its packing is open.
 */
export const STARTING_QUERY_PARAM = 'starting'

/** The packing list asking whether to finish the packing as the trip starts (FR-7.16). */
export function tripStartingPath(tripId: string): string {
  return `${tripPath(tripId)}?${new URLSearchParams({ [STARTING_QUERY_PARAM]: '1' }).toString()}`
}

/**
 * The packing list in its closing pass (FR-9.3) — where *Reise abschliessen*
 * leads from M2, since the trip's lifecycle steps are M2's alone.
 */
export function tripClosingPath(tripId: string): string {
  return `${tripPath(tripId)}?${new URLSearchParams({ [CLOSING_QUERY_PARAM]: '1' }).toString()}`
}

/** FR-7.13: the thread a notes link opens, as a route parameter. */
export const THREAD_ID_PARAM = ':threadId'

/**
 * The trip's notes (M26), or one thread of them. A thread is a screen of
 * its own — a conversation with its reply field at the bottom — so a link
 * from M1's row or a notification lands on it directly.
 */
export function tripNotesPath(tripId: string, threadId?: string): string {
  const path = tripSubPath(tripId, 'notes')
  return threadId ? `${path}/${threadId}` : path
}

/** The route parameter naming one excursion (FR-31, M27). */
export const EXCURSION_ID_PARAM = ':excursionId'

/** M27, or one excursion's own list under it (FR-31.6). */
export function tripExcursionsPath(tripId: string, excursionId?: string): string {
  const path = tripSubPath(tripId, 'excursions')
  return excursionId ? `${path}/${excursionId}` : path
}

/** Query key naming the idea whose sheet or panel is open over the board (M28, like M5's `?item=`). */
export const IDEA_QUERY_PARAM = 'idea'

/** The trip's ideas (M28), or one idea's sheet or panel open over them (FR-29.6). */
export function tripIdeasPath(tripId: string, ideaId?: string): string {
  const path = tripSubPath(tripId, 'ideas')
  if (!ideaId) return path
  const query = new URLSearchParams({ [IDEA_QUERY_PARAM]: ideaId })
  return `${path}?${query.toString()}`
}

/** Query key naming the path a screen was entered from (ADR-011 amendment; `backTarget.ts`). */
export const ORIGIN_QUERY_PARAM = 'from'

/** Query key naming the idea a screen's creator opens pre-filled from (FR-29.13). */
export const FROM_IDEA_QUERY_PARAM = 'fromIdea'

/** The screens an idea's results are made on (FR-29.13). */
export type IdeaBridgeScreen = Extract<TripSubScreen, 'excursions' | 'tasks' | 'shopping'>

/**
 * FR-29.13: the screen that makes one kind of result, its creator open and
 * pre-filled from an idea — entered from the idea's sheet, so `‹ back`
 * returns there (`meta.acceptsLinkedFrom`). The origin is encoded once more,
 * as `enteredFrom` does, because it carries a query of its own.
 */
export function ideaBridgePath(tripId: string, screen: IdeaBridgeScreen, ideaId: string): string {
  const query = new URLSearchParams({
    [FROM_IDEA_QUERY_PARAM]: ideaId,
    [ORIGIN_QUERY_PARAM]: encodeURIComponent(tripIdeasPath(tripId, ideaId)),
  })
  return `${tripSubPath(tripId, screen)}?${query.toString()}`
}

/** Query key naming the line whose sheet or panel is open over an excursion's list (M27, like M5's `?item=`). */
export const LINE_QUERY_PARAM = 'line'

/** One excursion's list with a line's sheet or panel open over it (FR-31.6). */
export function tripExcursionLinePath(tripId: string, excursionId: string, lineId: string): string {
  const query = new URLSearchParams({ [LINE_QUERY_PARAM]: lineId })
  return `${tripExcursionsPath(tripId, excursionId)}?${query.toString()}`
}

/**
 * The item sheet or panel over the packing list (M5): the trip's own route
 * with the item in the query, optionally naming the comment to flash (G-4).
 */
export function tripItemPath(tripId: string, itemId: string, commentId?: string): string {
  const query = new URLSearchParams({ [ITEM_QUERY_PARAM]: itemId })
  if (commentId) query.set(COMMENT_QUERY_PARAM, commentId)
  return `${tripPath(tripId)}?${query.toString()}`
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
