import { openingView, readLastView, writeLastView, type OpeningTrip } from '@/lib/tripOpening'
import { tripViewEntry } from '@/lib/tripViews'
import { tripPath } from './paths'
import type { RouteLocationNormalized, Router } from 'vue-router'

/** The route name of {@link tripOpenPath}'s record. */
export const TRIP_OPEN_ROUTE = 'trip-open'

/** What the opening reads beside the trip row — the orchestrator's, narrowed. */
export interface TripOpeningSource {
  getTrip: (tripId: string) => OpeningTrip | undefined
  /** How many rows the trip's packing list has. */
  itemCount: (tripId: string) => number
  tripDataLoaded: (tripId: string) => boolean
  /** Whether the trip's day plan holds nothing on a day — the planner's answer. */
  dayPlanEmpty: (tripId: string, trip: OpeningTrip, day: string) => boolean
  /** The shopping list's open purchases — the shopping module's count. */
  shoppingOpen: (tripId: string) => number
  /** The trip's open tasks. */
  tasksOpen: (tripId: string) => number
  today: () => string
}

/**
 * openingTarget is the path a trip opens on (FR-29.7). A trip that is not on
 * the device yet — a cold deep link before the master pull — opens on the
 * packing list, which waits for it.
 *
 * The partition is not waited for: a list that has not arrived counts as not
 * empty, so the tap goes to the packing list rather than hanging on the
 * network.
 */
export function openingTarget(tripId: string, source: TripOpeningSource): string {
  const trip = source.getTrip(tripId)
  if (!trip) return tripPath(tripId)
  const today = source.today()
  const loaded = source.tripDataLoaded(tripId)
  const view = openingView(trip, {
    today,
    lastView: readLastView(tripId),
    packingEmpty: loaded ? source.itemCount(tripId) === 0 : null,
    todayEmpty: loaded ? source.dayPlanEmpty(tripId, trip, today) : null,
    shoppingOpen: source.shoppingOpen(tripId),
    tasksOpen: source.tasksOpen(tripId),
  })
  return tripViewEntry(view, tripId).path
}

function tripIdOf(route: RouteLocationNormalized): string | null {
  const id = route.params.tripId
  return typeof id === 'string' ? id : null
}

/**
 * installTripOpening turns {@link tripOpenPath} into the view it decides, as a
 * redirect that keeps the navigation's kind, and remembers every trip view visited afterwards.
 */
export function installTripOpening(router: Router, source: TripOpeningSource): void {
  router.beforeEach((to) => {
    if (to.name !== TRIP_OPEN_ROUTE) return true
    const tripId = tripIdOf(to)
    if (!tripId) return true
    // The redirect keeps the navigation's own kind: a push from M2 stays a
    // push, so back still returns to M2 — `replace` here would overwrite it.
    return openingTarget(tripId, source)
  })

  router.afterEach((to, _from, failure) => {
    if (failure || !to.meta.tripView) return
    const tripId = tripIdOf(to)
    if (tripId) writeLastView(tripId, to.meta.tripView)
  })
}
