/**
 * Mutation factory — creates properly shaped Mutation objects for common
 * packing-list actions. Every mutation gets a unique ID and the current HLC.
 *
 * All writes go through these helpers → SyncOutbox → server (P-2, G-5).
 *
 * It sits in the sync layer rather than among the composables because it is
 * neither: it touches no reactivity, and it is called from the CLI and named
 * by `domain/portableImport.ts`, which may not reach up into a caller's layer
 * (invariant 4). The `use` prefix it carried said otherwise.
 *
 * The mutations themselves live one area to a file under `mutations/`, each a
 * factory over the shared {@link MutationContext}; this one spreads them, so
 * a change to one area reads one file and callers see a single object.
 */

import { newId } from '@/lib/ids'
import type { Mutation, MutationOp } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'
import { defaultNowIso, type NowIso } from '@/lib/clock'
import type { SyncTable } from '@/api/tables'
import type { MutationContext, MutationFields } from './mutations/context'
import { createPackStateMutations } from './mutations/packState'
import { createTripItemsMutations } from './mutations/tripItems'
import { createTasksMutations } from './mutations/tasks'
import { createNotesMutations } from './mutations/notes'
import { createExcursionsMutations } from './mutations/excursions'
import { createTripsMutations } from './mutations/trips'
import { createMasterDataMutations } from './mutations/masterData'
import { createTemplatesMutations } from './mutations/templates'

export { CLIENT_ACTOR_PLACEHOLDER } from './mutations/context'

export type { AddedItemDecision } from './mutations/tripItems'
export type { TaskFiling } from './mutations/tasks'
export type { NoteThreadFields } from './mutations/notes'

/**
 * What an update mutation may change, one type per row.
 *
 * Each is `Partial<Pick<Entity, …>>` over the *domain* shape, so a caller
 * hands over booleans and objects and the mutation renders the columns
 * (`rowFrom`). Two things follow, and both are the point of naming them:
 * a field that is not the user's to set — an actor column, a foreign key
 * another action owns — cannot be named at all, and a view never decides
 * how a value is spelled on the wire.
 */
export type {
  TripEdit,
  ContainerEdit,
  SeriesEdit,
  DestinationProfileEdit,
  ChecklistItemEdit,
} from './mutations/trips'
export type { MasterItemEdit, ItemDependencyEdit } from './mutations/masterData'
export type { TemplateEdit, TemplateItemEdit } from './mutations/templates'

export function createMutations(hlc: HLCGenerator, nowIso: NowIso = defaultNowIso) {
  function make<T extends SyncTable>(
    op: MutationOp,
    table: T,
    id: string,
    fields?: MutationFields<T>,
  ): Mutation {
    return {
      mutation_id: newId(),
      op,
      table,
      id,
      fields,
      hlc: hlc.next(),
    }
  }

  const ctx: MutationContext = { make, nowIso }
  return {
    /**
     * The raw builder, for a feature module's own tables (FR-30.3). A module
     * gets it through `ModuleHost.mutation`, never this factory, which keeps
     * the named packing mutations spread below out of its reach.
     */
    make,
    ...createPackStateMutations(ctx),
    ...createTripItemsMutations(ctx),
    ...createTasksMutations(ctx),
    ...createNotesMutations(ctx),
    ...createExcursionsMutations(ctx),
    ...createTripsMutations(ctx),
    ...createMasterDataMutations(ctx),
    ...createTemplatesMutations(ctx),
  }
}
