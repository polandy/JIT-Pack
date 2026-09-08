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
