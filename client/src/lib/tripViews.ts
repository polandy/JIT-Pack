import type { InjectionKey } from 'vue'
import {
  briefcaseOutline,
  cartOutline,
  checkboxOutline,
  listOutline,
  statsChartOutline,
} from 'ionicons/icons'

import { t, type MessageKey } from '@/i18n'
import { tripPath, tripSubPath } from '@/router/paths'

/**
 * The trip's five views, named once (FR-21.21, ADR-051).
 *
 * The ids are the vocabulary three places share: the route table says which
 * view a route *is*, the switcher decides which pill is current from that,
 * and the e2e suite reaches a view by `trip-view-<id>`. A union rather than
 * four strings, so a route that names a view nobody renders does not compile.
 *
 * The order is the one a trip is worked through, and it is the order the two
 * readers below render in — the switcher's pills and the bar's ⋮ entries.
 */
export const TRIP_VIEW_IDS = ['packing', 'shopping', 'tasks', 'luggage', 'analytics'] as const

/** One of the trip's five views — see TRIP_VIEW_IDS. */
export type TripViewId = (typeof TRIP_VIEW_IDS)[number]

/**
 * A count a view carries in its pill — the open shopping list's things to buy
 * (FR-21.21). Provided by the composition root: the switcher is frame code,
 * and the count belongs to the module behind the pill, which the frame does
 * not import (FR-30.3, ADR-066). A view without an entry shows no count.
 */
export type TripViewCounts = Partial<Record<TripViewId, (tripId: string) => number>>

/** The injection key the switcher reads its counts from. */
export const TRIP_VIEW_COUNTS = Symbol('tripViewCounts') as InjectionKey<TripViewCounts>

/**
 * The views that earn a pill under the page's name (ADR-051 amendment 1).
 *
 * ADR-051 gave all four a pill, and the row filled a 390 px line to within
 * six pixels: four destinations, all equally loud, two of which are read once
 * a trip. The owner's call of 2026-09-20 is that the luggage and the analytics
 * are not that — so the row keeps the views a trip is *worked* in, and the
 * other two are words in the bar's ⋮ again, where the once-per-trip actions
 * already are.
 *
 * FR-7.7 adds the third worked-in view by that same rule: the tasks are
 * returned to across a trip, not read once. It re-opens the measurement the
 * amendment made — three words against the four that did not fit — so the
 * row is measured again at 360 px rather than assumed (UI-Test-Spec, M25).
 */
export const TRIP_VIEW_PILLS: readonly TripViewId[] = ['packing', 'shopping', 'tasks']

/** What one view is called, where it lives, and the glyph it wears (G-12). */
interface TripViewSpec {
  icon: string
  nameKey: MessageKey
  /**
   * Where a view carries a number, the word that holds it. A pill can show a
   * badge and an action-sheet entry cannot, so the count is part of the word
   * for both (ADR-050) — which is also why it survives the move between them.
   */
  countKey?: MessageKey
  path: (tripId: string) => string
}

const TRIP_VIEW_SPECS: Record<TripViewId, TripViewSpec> = {
  packing: { icon: listOutline, nameKey: 'packing.title', path: tripPath },
  shopping: {
    icon: cartOutline,
    nameKey: 'packing.shopping',
    countKey: 'packing.shoppingCount',
    path: (tripId) => tripSubPath(tripId, 'shopping'),
  },
  tasks: {
    icon: checkboxOutline,
    nameKey: 'packing.tasks',
    countKey: 'packing.tasksCount',
    path: (tripId) => tripSubPath(tripId, 'tasks'),
  },
  luggage: {
    icon: briefcaseOutline,
    nameKey: 'packing.luggage',
    path: (tripId) => tripSubPath(tripId, 'containers'),
  },
  analytics: {
    icon: statsChartOutline,
    nameKey: 'packing.analytics',
    path: (tripId) => tripSubPath(tripId, 'analytics'),
  },
}

/** One view of one trip, ready to render as a pill or as a menu entry. */
export interface TripViewEntry {
  id: TripViewId
  icon: string
  label: string
  path: string
  /**
   * What the suite reaches this view by, in either shape — the bar gives a
   * menu entry the id its pill would have carried, so a case that knows where
   * to click does not have to know which shape the view is wearing today.
   * Built here rather than in each renderer, so the two cannot drift apart.
   */
  testid: string
}

/**
 * One view, named in the active locale and pointed at one trip.
 *
 * The two shapes a view is rendered in — a pill under the page's name and an
 * entry in the bar's ⋮ — are the same destination wearing different clothes,
 * so they are described here once and chosen between by the two functions
 * below. A view moving from one to the other must not be able to change its
 * name, its glyph or where it goes on the way.
 */
export function tripViewEntry(
  id: TripViewId,
  tripId: string,
  counts: TripViewCounts = {},
): TripViewEntry {
  const spec = TRIP_VIEW_SPECS[id]
  const n = counts[id]?.(tripId) ?? 0
  return {
    id,
    icon: spec.icon,
    // At zero the word is offered without a number, because the destination
    // exists either way — a view whose count is the reason to tap it says so,
    // and one with nothing to report does not pretend otherwise.
    label: spec.countKey && n > 0 ? t(spec.countKey, { n }) : t(spec.nameKey),
    path: spec.path(tripId),
    testid: `trip-view-${id}`,
  }
}

/**
 * The views the switcher renders: the two that earn a pill, plus the one being
 * looked at when it is neither of them.
 *
 * Standing in a view the row does not otherwise show has to be visible: a row
 * that marks nothing as current is a row that has stopped saying where you are
 * (ADR-051 amendment 1), which is half of what the switcher is for.
 */
export function tripViewPills(current: TripViewId): TripViewId[] {
  // Read out of TRIP_VIEW_IDS rather than out of TRIP_VIEW_PILLS, so the row's
  // order is the one the trip is worked through however that set is written.
  const pills = TRIP_VIEW_IDS.filter((id) => TRIP_VIEW_PILLS.includes(id))
  // The current view goes last: it joins a row that already has an order, and
  // inserting it would move the two pills that are on every screen.
  return pills.includes(current) ? pills : [...pills, current]
}

/** The views the bar's ⋮ offers — the ones the switcher is not showing. */
export function tripViewMenu(current: TripViewId): TripViewId[] {
  const shown = tripViewPills(current)
  return TRIP_VIEW_IDS.filter((id) => !shown.includes(id))
}
