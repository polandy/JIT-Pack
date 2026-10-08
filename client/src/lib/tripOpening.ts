/**
 * Where a trip opens (FR-29.7): the view a tap on the trip lands on, decided by
 * date.
 *
 * Before the trip it opens on the view last visited on this device — on a
 * first visit the ideas while the packing list is empty, since there is
 * nothing to pack yet; from its first day to its last on the day plan, the
 * place a trip is lived in; afterwards on the packing list, where the closing
 * pass and the review are read.
 *
 * The last visited view is a viewing preference like a dashboard block's fold
 * (`composables/blockFold.ts`): this device's storage, never synced. Storage that
 * throws or is absent remembers nothing, and the trip opens as on a first
 * visit.
 */
import { hasDeparted } from '@/lib/tripPhase'
import { PACKING_VIEWS, TRIP_VIEW_PILLS, absentViews, type TripViewId } from '@/lib/tripViews'
import { TRIP_STATUS_ACTIVE, TRIP_STATUS_ARCHIVED } from '@/types/domain'

/** The trip as the rule reads it. */
export interface OpeningTrip {
  status: string
  start_date: string | null
  end_date: string | null
}

/** What the rule knows besides the trip. */
export interface OpeningFacts {
  /** The reader's local `YYYY-MM-DD`. */
  today: string
  /** The view this device last stood on in the trip, or null on a first visit. */
  lastView: TripViewId | null
  /**
   * Whether the packing list has no rows — null while the trip's partition is
   * not on the device, which is not an empty list (ADR-033).
   */
  packingEmpty: boolean | null
  /**
   * Whether today's day plan holds nothing of the travellers' own — null
   * while the trip's partition is not on the device, as above.
   */
  todayEmpty: boolean | null
  /** The shopping list's open purchases. */
  shoppingOpen: number
  /** The trip's open tasks. */
  tasksOpen: number
}

/** Whether the trip is over: closed, or its last day has passed. */
function isOver(trip: OpeningTrip, today: string): boolean {
  if (trip.status === TRIP_STATUS_ARCHIVED) return true
  return trip.end_date !== null && trip.end_date.slice(0, 10) < today
}

/**
 * Whether the trip is being lived: from its first day, or from *Reise
 * starten* when it was started early. A finished packing does not count — a
 * suitcase closed three days ahead is not a trip under way.
 */
export function isUnderWay(trip: OpeningTrip, today: string): boolean {
  if (isOver(trip, today)) return false
  return trip.status === TRIP_STATUS_ACTIVE || hasDeparted(trip, today)
}

/** openingView is the view a trip opens on (FR-29.7). */
export function openingView(trip: OpeningTrip, facts: OpeningFacts): TripViewId {
  if (isOver(trip, facts.today)) return 'packing'
  const absent = absentViews(trip)
  if (isUnderWay(trip, facts.today) && !absent.includes('dayplan')) {
    if (facts.todayEmpty !== true) return 'dayplan'
    // An empty list stays the landing too: it is where the next errand is added.
    return facts.shoppingOpen === 0 && facts.tasksOpen > 0 ? 'tasks' : 'shopping'
  }
  if (facts.lastView && !absent.includes(facts.lastView)) return facts.lastView
  return facts.packingEmpty === true ? 'ideas' : 'packing'
}

/**
 * The view to remember for a route's view: a pill's own, and the packing
 * list's for the two views read off it — opening a trip on its analytics
 * would land on a page read once a trip (ADR-051 amendment 1).
 */
export function rememberedView(view: TripViewId): TripViewId {
  if (PACKING_VIEWS.includes(view)) return 'packing'
  return TRIP_VIEW_PILLS.includes(view) ? view : 'packing'
}

/** Namespaced like the fold, one key per trip. */
const KEY_PREFIX = 'jp_trip_view_'

/** The view last visited in a trip on this device, or null. */
export function readLastView(tripId: string): TripViewId | null {
  try {
    const value = globalThis.localStorage?.getItem(KEY_PREFIX + tripId) ?? null
    return value !== null && (TRIP_VIEW_PILLS as readonly string[]).includes(value)
      ? (value as TripViewId)
      : null
  } catch {
    return null
  }
}

/** Remembers the view a trip was last visited on. */
export function writeLastView(tripId: string, view: TripViewId) {
  try {
    globalThis.localStorage?.setItem(KEY_PREFIX + tripId, rememberedView(view))
  } catch {
    // A view that cannot be remembered opens the trip as a first visit does.
  }
}
