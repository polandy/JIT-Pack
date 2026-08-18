import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

/**
 * The dev seed as one call: master partition first, then the trip.
 *
 * It lives beside the two seeds rather than in the M2 component because the
 * component's job is to *report* the outcome, and a report is only as good as
 * the thing it reports on. Keeping the summary here means a failure has one
 * place to come from and one shape — the component cannot accidentally
 * succeed-and-say-nothing, which is the failure mode this exists to end.
 */
type Orchestrator = ReturnType<typeof useSyncOrchestrator>

export interface SeedOutcome {
  tripId: string
  /** Ready to show: what was actually created, in the dev's language. */
  summary: string
}

export async function seedSampleData(orchestrator: Orchestrator): Promise<SeedOutcome> {
  const [{ seedSampleMaster }, { seedSampleTrip, seedPlannedTrip }] = await Promise.all([
    import('./sampleMaster'),
    import('./sampleTrip'),
  ])
  const master = seedSampleMaster(orchestrator)
  const tripId = seedSampleTrip(orchestrator)
  // FR-27.4 needs a trip that is still being planned; the one above is
  // active on purpose (FR-9.1 flags) and therefore frozen.
  const plannedTripId = seedPlannedTrip(orchestrator, master.vacationTemplateId)
  // Accepted outright: the seed exists to hand a fresh device a trip that
  // already has its groups' items, not a device with a question on it.
  orchestrator.acceptTripRefresh(plannedTripId)
  return {
    tripId,
    summary: `Beispieldaten: ${master.itemCount} Artikel, ${master.groupIds.length} Gruppen, 1 Vorlage, 2 Reisen (1 geplant)`,
  }
}
