/**
 * What every part of M4 reads and writes through: the trip, its rows, the
 * people on it, the snackbar's undo, and the two postures (the closing pass,
 * a removal still inside its undo) that change what the rest may do.
 *
 * Made once by `PackingListPage` and handed to each of its composables, so
 * none of them reaches into another — they meet here.
 */
import { computed, ref } from 'vue'

import { usePackAnnouncer } from '@/composables/usePackAnnouncer'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import type { RowUndoRecord } from '@/composables/useRowUndo'
import { useTripIdentity } from '@/composables/shared/useTripIdentity'
import type { TripScreen } from '@/composables/shared/useTripScreen'
import { canJudgeUnused, isActive } from '@/domain/trips'
import { pickAssignee as pickAssigneeFrom } from '@/composables/shared/pickAssignee'
import { isPackingClosed } from '@/domain/shared/tripPhase'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { TripItem, TripParticipant } from '@/types/domain'

/** M4's shared state and the undo-armed write helpers its parts share. */
export type PackingCore = ReturnType<typeof usePackingCore>

/**
 * Builds {@link PackingCore} for one trip; call once, in the page's setup.
 * The page loads the trip itself (`useTripScreen`, U-10) and hands it in.
 */
export function usePackingCore(tripId: string, screen: TripScreen) {
  const tripStore = useTripStore()
  const masterStore = useMasterStore()
  const orchestrator = useOrchestrator()

  // ADR-033: `loaded` says whether this trip's partition is on the device. M4's
  // three empty states all read off rows that arrive after the screen paints.
  const { trip, loaded: rowsLoaded, ensure: ensureTripRows } = screen

  // --- Identity, for FR-25.19/25.20 ---------------------------------------
  const {
    myUserId,
    participants,
    nameOf,
    load: loadIdentity,
  } = useTripIdentity(tripId, orchestrator)

  /**
   * FR-9.3's closing pass: a *mode of M4*, not a screen of its own. It keeps
   * this list's grouping, facets and search — at a hundred and twenty rows
   * that is the whole reason it lives here — and takes the ending the
   * rejected own-screen variant had: *Fertig* archives and opens M14, so
   * the pass leads where the marks are going rather than handing back the
   * list it started in. The only door into it is the archive action.
   */
  const closingPass = ref(false)

  /**
   * Rows whose confirmed removal is still inside the snackbar's undo (FR-25.31).
   * They leave the screen at once and the trip only when the undo lapses — the
   * row, its comments and its todos are never deleted and re-created, so the
   * undo cannot resurrect a note under the wrong author (invariant 3).
   */
  const removingRows = ref(new Set<string>())
  /** The same for the trip's own tasks (FR-7.4). */
  const removingTodos = ref(new Set<string>())

  const allItems = computed(() =>
    tripStore.getItems(tripId).filter((row) => !removingRows.value.has(row.id)),
  )
  const travelers = computed(() => tripStore.getTravelers(tripId))

  const active = computed(() => isActive(trip.value))
  /** FR-5.10: whether this trip's packing has been declared finished. */
  const packingClosed = computed(() => isPackingClosed(trip.value))
  /** FR-9.3's window, decided once in the domain (`canJudgeUnused`). */
  const judgeable = computed(() => canJudgeUnused(trip.value))

  function locked(item: TripItem): boolean {
    return orchestrator.isLockedByOther(tripId, item)
  }

  /** The rows behind a fan-out plan, in the order the plan names them. */
  function rowsOf(ids: string[]): TripItem[] {
    return ids.flatMap((id) => allItems.value.filter((row) => row.id === id))
  }

  /** The row as it is now, or null once it has left the trip. */
  function liveRow(itemId: string): TripItem | null {
    return tripStore.getItems(tripId).find((row) => row.id === itemId) ?? null
  }

  /**
   * FR-25.19: the people this trip's rows can be handed to — members of the
   * trip, minus myself. The same rule M5's control uses, and for the same
   * reason: assigning a row to myself says nothing, and in Single-User and
   * Local Mode there is nobody else at all, so the control is absent rather
   * than inert (G-8).
   */
  const assignableMembers = computed(() => {
    const members = new Set(tripStore.getMembers(tripId).map((m) => m.user_id))
    return participants.value.filter(
      (person) => members.has(person.user_id) && person.user_id !== myUserId.value,
    )
  })

  /**
   * FR-7.5: who a trip todo can be handed to — every member, *me included*.
   * A row leaves me out because an unassigned row is already mine to see
   * (FR-25.20); a todo has no such filter, and „I'll do it" is the most
   * common thing a household says about one.
   */
  const todoAssignees = computed(() => {
    const members = new Set(tripStore.getMembers(tripId).map((m) => m.user_id))
    return participants.value.filter((person) => members.has(person.user_id))
  })

  /**
   * The person picker for this screen's callers — the row's avatar, the
   * cluster head's „für alle" (FR-25.25/25.26) and a task. The sheet itself is
   * `composables/shared/pickAssignee`, shared with M25 since a task is handed over the same
   * way (FR-7.7); what stays here is only this screen's default audience.
   */
  async function pickAssignee(
    header: string,
    current: string | null,
    people: readonly TripParticipant[] = assignableMembers.value,
  ): Promise<string | null | undefined> {
    return pickAssigneeFrom(header, current, people)
  }

  const announcer = usePackAnnouncer()
  const { rowUndo, announceAct } = announcer

  /**
   * FR-25.31: act on one row behind the snackbar's undo. `restore` gets the row
   * as it is *when the undo fires* and writes back only the field its act
   * changed — building the write from the row in hand would revert whatever
   * landed in between (the reason `restorePack` re-reads, too). A row deleted
   * meanwhile stays deleted.
   */
  function actUndoably(
    item: TripItem,
    message: string,
    act: () => void,
    restore: (live: TripItem) => void,
  ) {
    const id = item.id
    rowUndo.armAction(item.name, () => {
      const live = liveRow(id)
      if (live) restore(live)
    })
    act()
    void announceAct(message)
  }

  /** The same for a fan-out over several rows (FR-25.26): one undo for all. */
  function armRowsUndo(rows: readonly TripItem[], restore: (live: TripItem) => void) {
    const ids = rows.map((row) => row.id)
    rowUndo.armAction(rows[0]?.name ?? '', () => {
      for (const id of ids) {
        const live = liveRow(id)
        if (live) restore(live)
      }
    })
  }

  /** Put back what a pack changed, and only that (FR-25.2). */
  function restorePacked(records: RowUndoRecord[]) {
    for (const record of records) {
      orchestrator.restorePack(record.itemId, record.packedCount, record.state)
    }
  }

  return {
    tripId,
    tripStore,
    masterStore,
    orchestrator,
    trip,
    rowsLoaded,
    ensureTripRows,
    myUserId,
    participants,
    nameOf,
    loadIdentity,
    closingPass,
    removingRows,
    removingTodos,
    allItems,
    travelers,
    active,
    packingClosed,
    judgeable,
    locked,
    rowsOf,
    liveRow,
    assignableMembers,
    todoAssignees,
    pickAssignee,
    ...announcer,
    actUndoably,
    armRowsUndo,
    restorePacked,
  }
}
