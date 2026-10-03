/**
 * The contract between an excursion's own screen and the connections that
 * belong to it (FR-29.18).
 *
 * A connection is a day-plan entry, written and read by the planner module,
 * while the excursion's screen (M27) is the packing side's — and neither may
 * import the other (`scripts/module-boundary-gate.mjs`). So the planner offers
 * the part of the screen it owns as a component, the composition root
 * (`App.vue`) binds it, and M27 renders it with the excursion it stands on,
 * `tripCards.ts`'s arrangement for the same reason.
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
