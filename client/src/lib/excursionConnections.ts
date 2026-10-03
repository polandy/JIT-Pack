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
  /** The excursion's first day, `YYYY-MM-DD`, where a connection written by hand lands. */
  day: string | null
}

/** The injection key M27 reads the planner's connections section through; null where there is none. */
export const EXCURSION_CONNECTIONS = Symbol(
  'excursionConnections',
) as InjectionKey<Component | null>
