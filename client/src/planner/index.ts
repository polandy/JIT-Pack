/**
 * The planner's public face (§3.29, FR-29.9) — what the composition root
 * wires, and the only file outside code may reach into this directory
 * through (the router's lazy page import aside). The dev seed uses it too,
 * to write its ideas through the module's own actions.
 */
import type { DayPlanSource } from '@/domain/shared/dayPlanLine'
import type { IdeaLookup } from '@/domain/shared/ideaBridge'
import { openingDayHoldsNothing, type TripDates } from './domain/dayPlan'
import { undecidedCount } from './domain/ideas'
import { usePlannerStore } from './store'

export { plannerFeatureStore, usePlannerStore } from './store'
export { createPlannerActions } from './actions'
export { default as PlannerTodayCard } from './PlannerTodayCard.vue'
export { default as ExcursionConnections } from './ExcursionConnections.vue'
export { excursionJourneyLine } from './journeyLine'
export { plannerActivityReaders } from './domain/activity'
export { voteTally } from './domain/ideas'

/** The switcher's number on *Ideen*: the ideas nobody has decided on yet. */
export function ideasCount(): (tripId: string) => number {
  const plannerStore = usePlannerStore()
  return (tripId) => undecidedCount(plannerStore.getIdeas(tripId))
}

/**
 * Whether the day a trip's plan opens on holds nothing (FR-29.7) — what the
 * kernel's opening rule asks before landing a trip under way on the plan.
 */
export function dayPlanEmpty(
  sources: readonly DayPlanSource[],
): (tripId: string, trip: TripDates, today: string) => boolean {
  const plannerStore = usePlannerStore()
  return (tripId, trip, today) =>
    openingDayHoldsNothing(today, {
      trip,
      ideas: plannerStore.getIdeas(tripId),
      entries: plannerStore.getDayEntries(tripId),
      lines: sources.flatMap((source) => source.lines(tripId)),
      // Whom a line is for decides nothing about whether the day holds it.
      travelers: [],
      entryTravelers: [],
    })
}

/**
 * FR-29.13: an idea as the packing side reads it — what a creator is
 * pre-filled with, and the title a result's origin line names.
 */
export function ideaLookup(): IdeaLookup {
  const plannerStore = usePlannerStore()
  return {
    idea(tripId, ideaId) {
      const idea = plannerStore.getIdeas(tripId).find((candidate) => candidate.id === ideaId)
      return idea && { id: idea.id, title: idea.title, plannedOn: idea.planned_on ?? null }
    },
  }
}
