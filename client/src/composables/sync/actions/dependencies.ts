/**
 * Item dependency actions (Addendum 3.20, FR-20.1) — master partition. Moved
 * out of the orchestrator closure under R-4; moves only, so
 * `useSyncOrchestrator`'s return shape is untouched.
 */
import {
  planDependencyBatch,
  type DependencyBatchPlan,
  type DependencyLinkDirection,
} from '@/domain/dependencies'
import { dependencyRow } from '../rows'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import type { ItemDependencyEdit } from '@/sync/mutations'
import type { DependencyMode, ItemDependency, MasterItem } from '@/types/domain'
import type { SyncContext } from '../context'

/**
 * What one bulk link wrote (FR-24.9 over FR-20.1): the plan it acted on —
 * which carries the items it had to skip and why — and the rows it created,
 * which is the whole of its undo. Nothing is changed, so nothing has to be
 * put back: an edge that was not there before is simply removed again.
 */
export interface BulkDependencyResult {
  plan: DependencyBatchPlan
  undo: string[]
}

/** createDependencyActions binds the dependency group to one sync context. */
export function createDependencyActions(ctx: SyncContext) {
  const { mutations, enqueueAndDrain, masterStore } = ctx

  function addItemDependency(
    itemId: string,
    dependsOnItemId: string,
    opts: Parameters<typeof mutations.addItemDependency>[2] = {},
  ): string {
    const { mutation, id } = mutations.addItemDependency(itemId, dependsOnItemId, opts)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateItemDependency(dependency: ItemDependency, fields: ItemDependencyEdit) {
    const mutation = mutations.updateItemDependency(dependency.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, dependencyRow(dependency)),
    })
  }

  function deleteItemDependency(dependencyId: string) {
    const mutation = mutations.deleteItemDependency(dependencyId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /**
   * Link many items to one at once (FR-24.9): either the selection needs the
   * picked item along, or the picked item comes along with each of them.
   *
   * The graph is read here rather than passed in, for the reason the bulk tag
   * actions read the assignments here: the plan is what decides *which* rows
   * are written, and a caller that computed it would be a second place where
   * a cycle could be let through.
   */
  function linkItemsToDependency(
    items: MasterItem[],
    pickedItemId: string,
    direction: DependencyLinkDirection,
    mode: DependencyMode,
  ): BulkDependencyResult {
    const plan = planDependencyBatch(
      masterStore.dependencyList,
      items.map((item) => item.id),
      pickedItemId,
      direction,
    )
    const undo = plan.edges.map((edge) =>
      addItemDependency(edge.item_id, edge.depends_on_item_id, { mode }),
    )
    return { plan, undo }
  }

  /** Remove the rows one bulk link created (FR-24.9's „Rückgängig"). */
  function undoBulkDependency(undo: string[]): void {
    for (const dependencyId of undo) deleteItemDependency(dependencyId)
  }

  return {
    addItemDependency,
    updateItemDependency,
    deleteItemDependency,
    linkItemsToDependency,
    undoBulkDependency,
  }
}
