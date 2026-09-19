import type { InjectionKey } from 'vue'

/**
 * The trip's four views, named once (FR-21.21, ADR-051).
 *
 * The ids are the vocabulary three places share: the route table says which
 * view a route *is*, the switcher decides which pill is current from that,
 * and the e2e suite reaches a view by `trip-view-<id>`. A union rather than
 * four strings, so a route that names a view nobody renders does not compile.
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
