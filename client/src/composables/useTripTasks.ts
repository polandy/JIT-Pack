/**
 * FR-7.6: a trip's tasks — its own (FR-7.4) and the preparations its rows owe
 * (FR-7.3) — as the one list every surface reads.
 *
 * Wiring only. The rule is `tripTasks` in `domain/tripTasks.ts`, which knows
 * nothing of stores and is tested without them; what lives here is the join
 * the rule needs: the rows a preparation can hang off, each with the mark it
 * inherits from its master item (FR-28.7). Four surfaces ask for the list —
 * M4's section and header figure, M1's card and each trip card's line — so
 * the join is written once. An idea's preparation step reads its due day
 * off the idea (FR-29.21), which the planner answers for through the bridge.
 */
import { inject } from 'vue'

import type { IdeaLookup } from '@/domain/shared/ideaBridge'
import { IDEA_LOOKUP } from '@/kernel/ideaBridge'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { tripTasks, type TripTask, type TripTaskItem } from '@/domain/tripTasks'

/**
 * Reader for the trip tasks of any trip this device holds. Without the
 * planner (no lookup) an idea's preparation steps wait, listed nowhere.
 */
export function useTripTasks(ideas: IdeaLookup | null = inject(IDEA_LOOKUP, null)) {
  const tripStore = useTripStore()
  const masterStore = useMasterStore()

  /**
   * The rows of a trip as a task line names them. The mark is the master
   * item's, never a copy on the row (FR-28.7) — an ad-hoc row has no master
   * item and therefore no mark.
   */
  function rowsOf(tripId: string): TripTaskItem[] {
    return tripStore.getItems(tripId).map((item) => ({
      id: item.id,
      name: item.name,
      icon: (item.source_item_id ? masterStore.getItem(item.source_item_id)?.icon : null) ?? null,
    }))
  }

  /** Every task of the trip, in FR-7.6's order. */
  function tasksOf(tripId: string): TripTask[] {
    return tripTasks(
      tripStore.getOwnTasks(tripId),
      tripStore.getPrepTasks(tripId),
      rowsOf(tripId),
      (ideaId) => ideas?.idea(tripId, ideaId),
      tripStore.getTrip(tripId)?.start_date ?? null,
    )
  }

  return { tasksOf }
}
