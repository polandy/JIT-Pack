import type { InjectionKey } from 'vue'

import type { TripViewCounts } from '@/lib/tripViews'

/** The injection key the switcher reads its counts from. */
export const TRIP_VIEW_COUNTS = Symbol('tripViewCounts') as InjectionKey<TripViewCounts>
