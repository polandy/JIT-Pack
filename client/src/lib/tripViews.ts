import type { InjectionKey } from 'vue'
import { briefcaseOutline, cartOutline, listOutline, statsChartOutline } from 'ionicons/icons'

import { t, type MessageKey } from '@/i18n'
import { tripPath, tripSubPath } from '@/router/paths'

/**
 * The trip's four views, named once (FR-21.21, ADR-051).
 *
 * The ids are the vocabulary three places share: the route table says which
 * view a route *is*, the switcher decides which pill is current from that,
 * and the e2e suite reaches a view by `trip-view-<id>`. A union rather than
 * four strings, so a route that names a view nobody renders does not compile.
 *
 * The order is the one a trip is worked through, and it is the order the two
 * readers below render in — the switcher's pills and the bar's ⋮ entries.
 */
export const TRIP_VIEW_IDS = ['packing', 'shopping', 'luggage', 'analytics'] as const

/** One of the trip's four views — see TRIP_VIEW_IDS. */
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
 * are not that — so the row keeps the two views a trip is *worked* in, and the
 * other two are words in the bar's ⋮ again, where the once-per-trip actions
 * already are.
 */
export const TRIP_VIEW_PILLS: readonly TripViewId[] = ['packing', 'shopping']

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
  const pills = TRIP_VIEW_IDS.filter((id) => TRIP_VIEW_PILLS.includes(id))
  return pills.includes(current) ? pills : [...pills, current]
}

/** The views the bar's ⋮ offers — the ones the switcher is not showing. */
export function tripViewMenu(current: TripViewId): TripViewId[] {
  const shown = tripViewPills(current)
  return TRIP_VIEW_IDS.filter((id) => !shown.includes(id))
}
