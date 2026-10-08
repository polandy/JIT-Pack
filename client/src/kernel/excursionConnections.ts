/**
 * The contract between an excursion's own screen and its day — the way there,
 * the route, the way back (FR-29.18, *Der Tag*).
 *
 * A connection is a day-plan entry, written and read by the planner module,
 * while the excursion's screen (M27) is the packing side's — and neither may
 * import the other (`scripts/module-boundary-gate.mjs`). So the planner offers
 * the part of the screen it owns as a component, the composition root
 * (`App.vue`) binds it, and M27 renders it with the excursion it stands on,
 * `tripCards.ts`'s arrangement for the same reason. The route between the two
 * ways is the packing side's (an excursion's GPX tracks), so M27 hands it in as
 * the component's `route` slot, and the card draws the day in its order.
 */
import type { Component, InjectionKey } from 'vue'

/** What the bound component is given. */
export interface ExcursionConnectionsProps {
  tripId: string
  excursionId: string
  /** The excursion's name, which the connection sheet says it is for. */
  title: string
  /** The excursion's first day, `YYYY-MM-DD`: the way there's; null while it has none. */
  day: string | null
  /** The excursion's last day: the way back's — the first for a day out. */
  lastDay: string | null
  /** Its first track's time with the pauses, for the time budget; null without a track. */
  routeMinutes: number | null
  /** Where its first track starts, `[lat, lon]`, for the timetable search's destination; null without a track. */
  routeStart: [number, number] | null
  /** The route folded to a line (*„3.3 km · ↑ 300 m"*), null without a track; the route itself is the `route` slot. */
  routeSummary: string | null
  /** The first track's distance alone (*„3.3 km"*), where the folded day has the ways beside it. */
  routeDistance: string | null
  /** Whether *Der Tag* is open — M27's fold (`composables/routeFold.ts`); the card emits `toggle` to change it. */
  open: boolean
}

/** The injection key M27 reads the planner's connections section through; null where there is none. */
export const EXCURSION_CONNECTIONS = Symbol(
  'excursionConnections',
) as InjectionKey<Component | null>

/**
 * M27's line under an excursion naming its way there and back
 * (*„08:06 hin · 16:23 zurück"*), or null with neither.
 */
export type ExcursionJourneyLine = (tripId: string, excursionId: string) => string | null

/** The injection key M27's list reads that line through; null where there is none. */
export const EXCURSION_JOURNEY_LINE = Symbol(
  'excursionJourneyLine',
) as InjectionKey<ExcursionJourneyLine | null>
