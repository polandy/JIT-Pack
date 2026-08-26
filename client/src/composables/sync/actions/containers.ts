/**
 * Container actions (FR-10.1, M11) — the first group moved out of the
 * orchestrator closure under R-4. Moves only: no renames, no signature
 * changes, so `useSyncOrchestrator`'s return shape is untouched.
 */
import { containerRow, itemRow } from '../rows'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import {
  pairWrites,
  releasePartnersOnDelete,
  unpairWrites,
  type PairingWrite,
} from '@/domain/containers'
import type { Container } from '@/types/domain'
import type { QueuedMutation, SyncContext } from '../context'

/** createContainerActions binds the container group to one sync context. */
export function createContainerActions(ctx: SyncContext) {
  const { mutations, enqueueAndDrain, tripStore } = ctx

  function addContainer(
    tripId: string,
    name: string,
    opts: Parameters<typeof mutations.addContainer>[2] = {},
  ): string {
    const { mutation, id } = mutations.addContainer(tripId, name, opts)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateContainer(tripId: string, container: Container, fields: Record<string, unknown>) {
    const mutation = mutations.updateContainer(container.id, fields)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticUpdate(mutation, containerRow(container)),
    })
  }

  /** pairingMuts turns domain-computed paired_container_id writes into queue entries. */
  function pairingMuts(containers: Container[], writes: PairingWrite[]): QueuedMutation[] {
    const muts: QueuedMutation[] = []
    for (const write of writes) {
      const current = containers.find((c) => c.id === write.containerId)
      if (!current) continue
      const mutation = mutations.updateContainer(write.containerId, {
        paired_container_id: write.paired_container_id,
      })
      muts.push({ mutation, optimistic: optimisticUpdate(mutation, containerRow(current)) })
    }
    return muts
  }

  /** applyPairingWrites persists a domain-computed set of paired_container_id writes. */
  function applyPairingWrites(tripId: string, writes: PairingWrite[]) {
    const muts = pairingMuts(tripStore.getContainers(tripId), writes)
    if (muts.length > 0) enqueueAndDrain('trip', tripId, ...muts)
  }

  /**
   * pairContainer pairs two containers exclusively, writing both sides at
   * once and releasing any previous partner of either (FR-10.3, M11).
   */
  function pairContainer(tripId: string, aId: string, bId: string) {
    applyPairingWrites(tripId, pairWrites(tripStore.getContainers(tripId), aId, bId))
  }

  /** unpairContainer clears both sides of the container's pair (FR-10.3, M11). */
  function unpairContainer(tripId: string, containerId: string) {
    applyPairingWrites(tripId, unpairWrites(tripStore.getContainers(tripId), containerId))
  }

  /**
   * deleteContainer unassigns the container's items first —
   * trip_items.container_id is a plain FK, a dangling reference would
   * reject the delete server-side. A surviving pair partner is released
   * with it (FR-10.3): deleting one side frees the other.
   */
  function deleteContainer(tripId: string, containerId: string) {
    const containers = tripStore.getContainers(tripId)
    // One enqueueAndDrain for release + unassign + delete, so the batch
    // stays atomic in the queue.
    const muts = pairingMuts(containers, releasePartnersOnDelete(containers, containerId))
    for (const item of tripStore.getItems(tripId)) {
      if (item.container_id !== containerId) continue
      const mut = mutations.assignContainer(item.id, null)
      muts.push({
        mutation: mut,
        optimistic: optimisticUpdate(mut, itemRow(item)),
      })
    }
    const deleteMut = mutations.deleteContainer(containerId)
    muts.push({
      mutation: deleteMut,
      optimistic: optimisticDelete(deleteMut),
    })
    enqueueAndDrain('trip', tripId, ...muts)
  }

  return {
    addContainer,
    updateContainer,
    pairContainer,
    unpairContainer,
    deleteContainer,
  }
}
