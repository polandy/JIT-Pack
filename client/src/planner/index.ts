/**
 * The planner's public face (§3.29, FR-29.9) — what the composition root
 * wires, and the only file outside code may reach into this directory
 * through (the router's lazy page import aside). The dev seed uses it too,
 * to write its ideas through the module's own actions.
 */
import type { DayPlanSource } from '@/lib/dayPlanSources'
import { dayHoldsNothing, type TripDates } from './domain/dayPlan'
import { undecidedCount } from './domain/ideas'
import { usePlannerStore } from './store'

export { plannerFeatureStore, usePlannerStore } from './store'
export { createPlannerActions } from './actions'
export { default as PlannerTodayCard } from './PlannerTodayCard.vue'
export { plannerActivityReaders } from './domain/activity'
export { voteTally } from './domain/ideas'

/** The switcher's number on *Ideen*: the ideas nobody has decided on yet. */
export function ideasCount(): (tripId: string) => number {
  const plannerStore = usePlannerStore()
  return (tripId) => undecidedCount(plannerStore.getIdeas(tripId))
}

/**
 * Whether a trip's day plan holds nothing on a day (FR-29.7) — what the
 * kernel's opening rule asks before landing a trip under way on the plan.
 */
export function dayPlanEmpty(
  sources: readonly DayPlanSource[],
): (tripId: string, trip: TripDates, day: string) => boolean {
  const plannerStore = usePlannerStore()
  return (tripId, trip, day) =>
    dayHoldsNothing(day, {
      trip,
      ideas: plannerStore.getIdeas(tripId),
      entries: plannerStore.getDayEntries(tripId),
      lines: sources.flatMap((source) => source.lines(tripId)),
    })
}
