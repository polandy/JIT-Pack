import { computed } from 'vue'

import { cleanupSettings } from './useCleanupSettings'
import { useOrchestrator } from './useOrchestrator'
import { hygieneReport, unseenTrips } from '@/domain/inventoryHygiene'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'

/**
 * The FR-24.12 report over this device's stores — what M24 lists and the
 * count M9 carries. The rules are `domain/inventoryHygiene` (invariant 4);
 * this only feeds them, so M9 and M24 cannot compute two different numbers.
 *
 * Only *active* Vorlagen count as holding an item: a retired one is never
 * generated again (FR-24.3), so it is not the use the unused rule means.
 */
export function useInventoryHygiene() {
  const masterStore = useMasterStore()
  const tripStore = useTripStore()
  const orchestrator = useOrchestrator()
  const { settings } = cleanupSettings()

  const positions = computed(() =>
    masterStore.activeTemplateList.flatMap((tpl) => masterStore.getTemplateItems(tpl.id)),
  )

  const report = computed(() =>
    hygieneReport(
      {
        items: masterStore.activeItemList,
        tags: masterStore.tagList,
        assignments: masterStore.itemTagList,
        templates: masterStore.activeTemplateList,
        positions: positions.value,
        trips: tripStore.tripList,
        tripRows: tripStore.tripList.flatMap((trip) => tripStore.getItems(trip.id)),
        today: orchestrator.today(),
      },
      settings.value,
    ),
  )

  /** Trips in the window whose rows this device has not pulled (ADR-032). */
  const unseen = computed(() =>
    unseenTrips(
      tripStore.tripList,
      (tripId) => orchestrator.tripDataLoaded(tripId),
      orchestrator.today(),
      settings.value.unusedMonths,
    ),
  )

  return { report, unseen }
}
