/**
 * Cards a feature module shows under a trip on the dashboard (FR-30.7).
 *
 * M1 is packing-side frame code and does not import a module (FR-30.3). A
 * module that has something to show per trip — the shopping list first, the
 * planner's shortlist perhaps next — hands M1 a component instead, through
 * the composition root, and M1 renders it under each trip with these props.
 * The component decides for itself whether it has anything to say; one with
 * nothing renders nothing.
 */
import type { Component, InjectionKey } from 'vue'

/** What M1 tells a card about the trip it sits under. */
export interface TripCardProps {
  tripId: string
  tripName: string
  /** A trip that has not started yet (FR-6.1's *Demnächst*), rather than a running one. */
  planned: boolean
  /** Whether its packing has been declared finished (FR-5.10) — FR-30.8 reads it. */
  packingClosed: boolean
  /**
   * FR-7.10: the card is drawn as a block *of the hero* — seven lines, no chip,
   * folding — once the packing is finished, instead of as the card under it.
   */
  embedded?: boolean
}

/** The cards the composition root provides, in the order M1 renders them. */
export const TRIP_CARDS = Symbol('tripCards') as InjectionKey<readonly Component[]>
