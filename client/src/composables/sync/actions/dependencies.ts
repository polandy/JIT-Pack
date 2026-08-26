/**
 * Item dependency actions (Addendum 3.20, FR-20.1) — master partition. Moved
 * out of the orchestrator closure under R-4; moves only, so
 * `useSyncOrchestrator`'s return shape is untouched.
 */
import { dependencyRow } from '../rows'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import type { ItemDependency } from '@/types/domain'
import type { SyncContext } from '../context'

/** createDependencyActions binds the dependency group to one sync context. */
export function createDependencyActions(ctx: SyncContext) {
  const { mutations, enqueueAndDrain } = ctx

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

  function updateItemDependency(dependency: ItemDependency, fields: Record<string, unknown>) {
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

  return { addItemDependency, updateItemDependency, deleteItemDependency }
}
