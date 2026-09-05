import { computed, onMounted, type ComputedRef } from 'vue'

import { useTripStore } from '@/stores/tripStore'
import type { Trip } from '@/types/domain'

/**
 * The three orchestrator methods a trip screen needs to be able to show
 * anything. Narrowed to those, so a test hands over three functions rather
 * than a sync stack — the `useTripIdentity` idiom.
 */
export interface TripScreenSource {
  subscribeTrip: (tripId: string) => void
  drainTrip: (tripId: string, opts?: { background?: boolean }) => Promise<void>
  tripDataLoaded: (tripId: string) => boolean
}

/** One trip's rows, and whether they are here yet. */
export interface TripScreen {
  /** The trip itself. It is master data, so it arrives with M2's pull. */
  trip: ComputedRef<Trip | undefined>
  /**
   * Whether this trip's *own* partition is on the device (ADR-033). A screen
   * with an empty state owes this guard: a partition that has not arrived is
   * not an empty trip, and saying so is the #208 defect one screen up.
   */
  loaded: ComputedRef<boolean>
  /**
   * The load, awaitable for a screen that has an ordering of its own — M4
   * proposes its group refresh and restores its scroll offset only once the
   * rows are here.
   *
   * Registered on `onMounted` by this composable already; calling it is
   * joining that load, not starting a second one. The in-flight promise is a
   * latch rather than an event, so the order the two hooks run in cannot
   * matter.
   */
  ensure: () => Promise<void>
}

/**
 * What every screen showing one trip has to do before it renders: say it is
 * watching the trip, and fetch the trip's partition.
 *
 * It exists because only M4 did it (U-10, 2026-09-05). Every sibling — M6,
 * M11, M12, M14, M16, M21, M22 — relied on having been *reached through* M4,
 * so in `server` mode a reload or a shared link straight onto one of them
 * rendered an empty screen over rows that were on the server. Local Mode hid
 * it completely: there the whole database is hydrated at startup, so the
 * cheapest possible test of this rule is green on the mode that does not have
 * it. E2E-G9-18 drives the mode that does.
 *
 * The drain is the foreground kind, unlike M2's row-progress (ADR-033): a
 * screen the user opened is a load the user asked for, and the G-2 glyph is
 * the place that says so.
 */
export function useTripScreen(tripId: string, source: TripScreenSource): TripScreen {
  const store = useTripStore()
  let inFlight: Promise<void> | null = null

  function ensure(): Promise<void> {
    if (!inFlight) {
      source.subscribeTrip(tripId)
      inFlight = source.drainTrip(tripId)
    }
    return inFlight
  }

  onMounted(ensure)

  return {
    trip: computed(() => store.getTrip(tripId)),
    loaded: computed(() => source.tripDataLoaded(tripId)),
    ensure,
  }
}
