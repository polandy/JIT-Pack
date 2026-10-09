/**
 * What a row of M4 shows besides its name and count: the sentences under it,
 * its edge avatar, the photo and mark it inherits, its open preparation and
 * the excursions borrowing it. Reads only — every write is `useRowActions`'.
 */
import { computed } from 'vue'

import type { PackingRowNotes, RowEdgeAvatar } from '@/components/trips/PackingRow.vue'
import { borrowersByTripItem } from '@/domain/excursionSuitcase'
import { rowEdgeAvatar, type PackingCluster } from '@/domain/packingView'
import { avatarAssignable } from '@/domain/rowMenu'
import { lockNoteText, packedStampText, responsibleNote, skippedNote } from '@/lib/rowFacts'
import { t } from '@/i18n'
import type { MasterItem, TripItem } from '@/types/domain'

import type { PackingCore } from './usePackingCore'

/**
 * The row resolvers `PackingGroupList` renders through — the port M4 answers
 * from its trip and M27 with a line's inert answers (FR-31.6).
 */
export interface ListFacts {
  locked(item: TripItem): boolean
  rowNotes(item: TripItem): PackingRowNotes
  edgeAvatarFor(item: TripItem): RowEdgeAvatar | null
  assignableRow(item: TripItem): boolean
  masterOf(item: TripItem): MasterItem | null
  clusterMaster(cluster: PackingCluster): MasterItem | null
  openTodoCount(itemId: string): number
  borrowedBy(itemId: string): readonly string[]
}

/** M4's {@link ListFacts}, with the lock's wording the browse sheet reads too. */
export interface RowFacts extends ListFacts {
  lockNote(item: TripItem): string | null
}

/** Builds {@link RowFacts} over the page's core. */
export function useRowFacts(core: PackingCore): RowFacts {
  const { tripId, tripStore, masterStore, orchestrator, nameOf, locked } = core

  function openTodoCount(itemId: string): number {
    return tripStore.getItemTodos(tripId, itemId).filter((todo) => todo.task_state === 'open')
      .length
  }

  /** G-3's "in progress by Andy", worded in `lib/rowFacts.ts` (U-2). */
  function lockNote(item: TripItem): string | null {
    return lockNoteText(orchestrator.lockHolder(tripId, item), nameOf)
  }

  /**
   * The row I claimed says so to *me*: nothing is locked for my own device,
   * so without a word here I cannot tell that I am holding the row against
   * everyone else.
   */
  function ownClaimNote(item: TripItem): string | null {
    return orchestrator.holdsClaim(tripId, item) ? t('packing.claimedByMe') : null
  }

  /** FR-25.17: "gepackt von Andy · heute 14:32", on revealed rows only. */
  function packedStamp(item: TripItem): string | null {
    return packedStampText(item, nameOf)
  }

  /**
   * FR-5.5, worded in `lib/rowFacts.ts`. A row that is done because it was
   * left behind says so where a packed row carries its FR-25.17 stamp; with
   * nothing there, it is exactly the "forgot it" / "decided against it"
   * confusion FR-5.5 exists to remove.
   */
  function skippedNoteFor(item: TripItem): string | null {
    return skippedNote(item, core.allItems.value, masterStore.dependencyList)
  }

  /** Named only where it differs from the packer — otherwise it is noise. */
  function responsibleNoteFor(item: TripItem): string | null {
    return responsibleNote(item, nameOf)
  }

  /** FR-31.12: which excursions ahead borrow each suitcase row. */
  const borrowers = computed(() =>
    borrowersByTripItem(
      tripStore.getExcursions(tripId),
      tripStore.getExcursionItems(tripId),
      orchestrator.today(),
    ),
  )

  function borrowedBy(itemId: string): readonly string[] {
    return borrowers.value.get(itemId) ?? []
  }

  /**
   * The sentences a row can put under its name, all of them — `PackingRow`
   * owns the order it prefers them in, because both kinds of row prefer the
   * same one and that is the rule worth having in one place.
   */
  function rowNotes(item: TripItem): PackingRowNotes {
    return {
      lock: lockNote(item),
      ownClaim: ownClaimNote(item),
      skipped: skippedNoteFor(item),
      packed: packedStamp(item),
      responsible: responsibleNoteFor(item),
    }
  }

  /** FR-25.19's edge avatar, with the name the row shows resolved here. */
  function edgeAvatarFor(item: TripItem): RowEdgeAvatar | null {
    const edge = rowEdgeAvatar(item)
    return edge ? { ...edge, name: nameOf(edge.id) } : null
  }

  /** FR-25.25, decided in the domain (`avatarAssignable`) — see there for why. */
  function assignableRow(item: TripItem): boolean {
    return avatarAssignable(item, {
      hasAssignees: core.assignableMembers.value.length > 0,
      closingPass: core.closingPass.value,
      locked: locked(item),
    })
  }

  /**
   * FR-28.7: the row inherits the master item's photo and mark, it never copies
   * them — the mark is a property of the thing, not of one trip's plan. An
   * ad-hoc row has no master item and therefore no mark, and shows an empty
   * slot rather than a placeholder.
   */
  function masterOf(item: TripItem): MasterItem | null {
    return (item.source_item_id ? masterStore.getItem(item.source_item_id) : undefined) ?? null
  }

  /**
   * The same resolution for a per-person cluster, which has no `TripItem` of
   * its own — the head is the item, its children are the travelers.
   */
  function clusterMaster(cluster: PackingCluster): MasterItem | null {
    return (cluster.sourceItemId ? masterStore.getItem(cluster.sourceItemId) : undefined) ?? null
  }

  return {
    locked,
    lockNote,
    rowNotes,
    edgeAvatarFor,
    assignableRow,
    masterOf,
    clusterMaster,
    openTodoCount,
    borrowedBy,
  }
}
