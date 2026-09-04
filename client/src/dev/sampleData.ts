import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { ITEM_MODE_PACK } from '@/types/domain'

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
  const tripId = seedSampleTrip(orchestrator, master.items)
  // FR-27.4 needs a trip that follows something; the one above is imported
  // (and active on purpose, for the FR-9.1 flags), so it follows nothing.
  const plannedTripId = seedPlannedTrip(orchestrator, master.vacationTemplateId)
  // Accepted outright: the seed exists to hand a fresh device a trip that
  // already has its groups' items.
  orchestrator.acceptTripRefresh(plannedTripId)

  // …and then one group gains a position, so the device also arrives with an
  // *open* FR-27.4 question on that trip. Without it the proposal card is
  // unreachable from a fresh install without first editing a group by hand,
  // which is exactly what the seed exists to spare (standing rule, 2026-08-16).
  // A headlamp for night macro — and, more to the point, an item the trip
  // does not already carry: the tripod would have been silent, because
  // Wildlife already put it there and the position is keyed on the item.
  const macro = master.groups['Makro Fotografie']
  const headlamp = master.items['Stirnlampe']
  if (macro && headlamp) {
    orchestrator.addTemplateItem(macro, headlamp, {
      quantity: 1,
      assignment: 'trip_global',
      defaultMode: ITEM_MODE_PACK,
    })
    orchestrator.proposeTripRefresh(plannedTripId)
  }
  return {
    tripId,
    summary: `Beispieldaten: ${master.itemCount} Artikel, ${Object.keys(master.groups).length} Gruppen, 1 Vorlage, 2 Reisen (1 geplant, mit offener Gruppenfrage)`,
  }
}
