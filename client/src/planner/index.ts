/**
 * The planner's public face (§3.29, FR-29.9) — what the composition root
 * wires, and the only file outside code may reach into this directory
 * through (the router's lazy page import aside). The dev seed uses it too,
 * to write its ideas through the module's own actions.
 */
import { undecidedCount } from './domain/ideas'
import { usePlannerStore } from './store'

export { plannerFeatureStore, usePlannerStore } from './store'
export { createPlannerActions } from './actions'
export { plannerActivityReaders } from './domain/activity'
export { voteTally } from './domain/ideas'

/** The switcher's number on *Ideen*: the ideas nobody has decided on yet. */
export function ideasCount(): (tripId: string) => number {
  const plannerStore = usePlannerStore()
  return (tripId) => undecidedCount(plannerStore.getIdeas(tripId))
}
