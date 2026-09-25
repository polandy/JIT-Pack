import { vi } from 'vitest'
import { reactive } from 'vue'

import type { TripScreenSource } from '@/composables/useTripScreen'

/** A `TripScreenSource` that records, plus the set `tripDataLoaded` answers from. */
export interface TripScreenStub extends TripScreenSource {
  /** The trips whose partition this device is pretending to hold (ADR-033). */
  loadedTrips: Set<string>
  /** FR-7.11: the day a task's due date is read against. */
  today: () => string
}

/** The day `tripScreenStub().today()` answers — a fixed one, so a due badge is a value. */
export const STUB_TODAY = '2026-07-08'

/**
 * The three methods every trip screen now calls on mount, for the mount specs
 * whose subject is one of those screens.
 *
 * Shared rather than written into each fake: they are the same three lines in
 * every one of them, and a spec that omitted them would not fail on an
 * assertion but on a `TypeError` inside `onMounted` — which reads as a broken
 * test rather than as the missing seam it is.
 */
export function tripScreenStub(): TripScreenStub {
  // Reactive, like the orchestrator's own `loadedTripPartitions`: `loaded` is
  // a computed over this set, and a plain one would leave every screen's
  // ADR-033 guard stuck on its first answer — in the spec only, which is the
  // worst place for a difference from production to live.
  const loadedTrips = reactive(new Set<string>())
  return {
    loadedTrips,
    subscribeTrip: vi.fn(),
    drainTrip: vi.fn(() => Promise.resolve()),
    tripDataLoaded: vi.fn((tripId: string) => loadedTrips.has(tripId)),
    today: vi.fn(() => STUB_TODAY),
  }
}
