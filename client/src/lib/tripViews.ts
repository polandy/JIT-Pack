import type { InjectionKey } from 'vue'
import {
  briefcaseOutline,
  cartOutline,
  chatbubblesOutline,
  checkboxOutline,
  listOutline,
  statsChartOutline,
} from 'ionicons/icons'

import { t, type MessageKey } from '@/i18n'
import { tripPath, tripSubPath } from '@/router/paths'

/**
 * The trip's six views, named once (FR-21.21, ADR-051).
 *
 * The ids are the vocabulary three places share: the route table says which
 * view a route *is*, the switcher decides which pill is current from that,
 * and the e2e suite reaches a view by `trip-view-<id>`. A union rather than
 * four strings, so a route that names a view nobody renders does not compile.
 *
 * The order is the one a trip is worked through, and it is the order the two
 * readers below render in — the switcher's pills and the bar's ⋮ entries.
 */
export const TRIP_VIEW_IDS = [
  'packing',
  'shopping',
  'tasks',
  'notes',
  'luggage',
  'analytics',
] as const

/** One of the trip's six views — see TRIP_VIEW_IDS. */
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
 * A pill each for the luggage and the analytics would fill a 390 px line to
 * within six pixels: destinations all equally loud, two of which are read once
 * a trip. So the row keeps the views a trip is *worked* in, and those two are
 * words in the bar's ⋮, where the once-per-trip actions already are.
 *
 * FR-7.7 adds the third worked-in view by that same rule: the tasks are
 * returned to across a trip, not read once. It re-opens the measurement the
 * amendment made — three words against the four that did not fit — so the
 * row is measured again at 360 px rather than assumed (UI-Test-Spec, M25).
 *
 * FR-7.13 adds the fourth: the trip's notes, a place people write in. Four
 * words did not fit a phone; four glyphs and one word do (amendment 3).
 */
export const TRIP_VIEW_PILLS: readonly TripViewId[] = ['packing', 'shopping', 'tasks', 'notes']

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
  /**
   * FR-7.13: the count is what is *new* rather than what is there, and wears
   * the colour a new thing wears — the notes count their unseen entries,
   * never their total.
   */
  countIsNew?: boolean
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
  notes: {
    icon: chatbubblesOutline,
    nameKey: 'notes.title',
    countKey: 'notes.viewCount',
    countIsNew: true,
    path: (tripId) => tripSubPath(tripId, 'notes'),
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
  /**
   * The number the label carries, or 0 — the icon-only pill wears it as a
   * badge beside a glyph that has no word to put it in (ADR-051 amendment 3).
   */
  count: number
  /** The count says what is new (FR-7.13's notes), not how much there is. */
  countIsNew: boolean
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
    count: spec.countKey ? n : 0,
    countIsNew: spec.countIsNew === true,
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

/**
 * The views that belong to packing: the list itself and the two read off it.
 * A ⋮ acts on the context it sits in, and the luggage and
 * the analytics are the packing list's — offered from the shopping list or
 * the tasks they were a way out of the place the user stood in.
 */
export const PACKING_VIEWS: readonly TripViewId[] = ['packing', 'luggage', 'analytics']

/**
 * The views the bar's ⋮ offers: the packing context's views the switcher is
 * not showing, and only from inside that context. From the shopping list or
 * the tasks the packing pill is the way there.
 */
export function tripViewMenu(current: TripViewId): TripViewId[] {
  if (!PACKING_VIEWS.includes(current)) return []
  const shown = tripViewPills(current)
  return PACKING_VIEWS.filter((id) => !shown.includes(id))
}
