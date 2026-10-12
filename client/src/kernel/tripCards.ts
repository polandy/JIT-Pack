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

import type { TripSubScreen } from '@/router/paths'
import type { DueTally } from '@/domain/shared/dueDay'

/** What M1 tells a card about the trip it sits under. */
export interface TripCardProps {
  tripId: string
  tripName: string
  /** A trip that has not started yet (FR-6.1's *Demnächst*), rather than a running one. */
  planned: boolean
  /** Whether its packing has been declared finished (FR-5.10) — FR-30.8 reads it. */
  packingClosed: boolean
  /** Its first day, or null for an undated trip — FR-30.8 reads it too. */
  startDate: string | null
  /** Its last day, or null — FR-29.7's *Heute* card shows on the trip's days only. */
  endDate: string | null
  /**
   * FR-7.10: the card is drawn as a block *of the hero* — seven lines, no chip,
   * folding — once the packing is finished, instead of as the card under it.
   */
  embedded?: boolean
}

/** The cards the composition root provides, in the order M1 renders them. */
export const TRIP_CARDS = Symbol('tripCards') as InjectionKey<readonly Component[]>

/**
 * FR-30.10: a trip's purchases due by tomorrow, and the overdue ones among
 * them — every line the dashboard's card would badge, the own entries and
 * the sources' alike — which M1's due line names beside the tasks (FR-7.11).
 * The tally is the shopping module's; M1 asks through this key, bound by the
 * composition root, and a build without the module simply counts nothing.
 */
export type DuePurchases = (tripId: string, today: string) => DueTally

/** The injection key M1 reads the due purchases from. */
export const DUE_PURCHASES = Symbol('duePurchases') as InjectionKey<DuePurchases>

/**
 * The dashboard blocks M1's due line leads to — named as the trip's screens
 * they hand over to, which is where the line leads when M1 shows no block.
 */
export type DueBlock = Extract<TripSubScreen, 'tasks' | 'shopping'>
export const DUE_BLOCK_TASKS = 'tasks' satisfies DueBlock
export const DUE_BLOCK_SHOPPING = 'shopping' satisfies DueBlock

/**
 * The element id of a trip's dashboard block, which the due line scrolls to.
 * Stated once here because the shopping card and M1 may not import each other.
 */
export function dueBlockAnchor(block: DueBlock, tripId: string): string {
  return `due-${block}-${tripId}`
}
