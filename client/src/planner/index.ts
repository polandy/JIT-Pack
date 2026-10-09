/**
 * The planner's public face (§3.29, FR-29.9) — what the composition root
 * wires, and the only file outside code may reach into this directory
 * through (the router's lazy page import aside). The dev seed uses it too,
 * to write its ideas through the module's own actions.
 */
import type { DayPlanSource } from '@/domain/shared/dayPlanLine'
import type { IdeaLookup } from '@/domain/shared/ideaBridge'
import type { FeatureModule, IdeaShortlist } from '@/kernel/moduleContribution'
import { plannerActivityReaders } from './domain/activity'
import { openingDayHoldsNothing, type TripDates } from './domain/dayPlan'
import { undecidedCount } from './domain/ideas'
import ExcursionConnections from './ExcursionConnections.vue'
import { excursionJourneyLine } from './journeyLine'
import PlannerTodayCard from './PlannerTodayCard.vue'
import { plannerFeatureStore, usePlannerStore } from './store'
import { IDEA_STATE_SHORTLISTED } from './types'

export { usePlannerStore }
export { createPlannerActions } from './actions'
export { voteTally } from './domain/ideas'

/** The module's registration (ADR-066 amendment 3), folded by the composition root. */
export const plannerModule: FeatureModule = {
  featureStore: plannerFeatureStore,
  contribute(host) {
    return {
      activityReaders: plannerActivityReaders,
      // FR-29.7: today's plan on the dashboard during the trip.
      tripCards: [PlannerTodayCard],
      // §3.29: the ideas nobody has decided on yet.
      viewCounts: { ideas: ideasCount() },
      dayPlanEmpty: dayPlanEmpty(host.dayPlanSources),
      // FR-29.13: the idea the packing side and the shopping module name.
      ideaLookup: ideaLookup(),
      // M31: where to eat out, offered to the meal plan.
      shortlist: ideaShortlist(),
      // FR-29.18: an excursion's day — the way there, the way back — on M27.
      excursionConnections: ExcursionConnections,
      excursionJourneyLine: excursionJourneyLine(),
    }
  },
}

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
  sources: () => readonly DayPlanSource[],
): (tripId: string, trip: TripDates, today: string) => boolean {
  const plannerStore = usePlannerStore()
  return (tripId, trip, today) =>
    openingDayHoldsNothing(today, {
      trip,
      ideas: plannerStore.getIdeas(tripId),
      entries: plannerStore.getDayEntries(tripId),
      lines: sources().flatMap((source) => source.lines(tripId)),
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

/** A trip's shortlisted ideas, as the meal plan offers them for eating out (M31). */
export function ideaShortlist(): IdeaShortlist {
  const plannerStore = usePlannerStore()
  return (tripId) =>
    plannerStore
      .getIdeas(tripId)
      .filter((idea) => idea.state === IDEA_STATE_SHORTLISTED)
      .map((idea) => ({ id: idea.id, title: idea.title }))
}

/** The module's rows and their vocabulary, for the composition root and the dev seed. */
export * from './types'
