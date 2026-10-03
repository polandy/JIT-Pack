/**
 * FR-29.18: M27's line naming an excursion's way there and back, bound by
 * `App.vue` through `lib/excursionConnections.ts` so the packing side reads
 * the planner's rows without importing it.
 */
import type { ExcursionJourneyLine } from '@/lib/excursionConnections'
import { excursionJourney } from './domain/journey'
import { journeyLine } from './journeyText'
import { usePlannerStore } from './store'

export function excursionJourneyLine(): ExcursionJourneyLine {
  const plannerStore = usePlannerStore()
  return (tripId, excursionId) =>
    journeyLine(excursionJourney(plannerStore.getDayEntries(tripId), excursionId))
}
