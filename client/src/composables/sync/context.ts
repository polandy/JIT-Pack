/**
 * The shared spine every extracted action group receives, so a group can be
 * imported, read and tested without constructing the whole orchestrator
 * (R-4). `useSyncOrchestrator` stays the single public facade: it builds one
 * context and spreads each group's actions into its own return shape.
 *
 * The context grows as groups move out — a field is added when a group that
 * needs it arrives, never before.
 */
import type { Mutation, PullChange } from '@/api/types'
import type { useMutations } from '../useMutations'
import type { useTripStore } from '@/stores/tripStore'

/** One queued write: the mutation itself plus the row it optimistically paints. */
export interface QueuedMutation {
  mutation: Mutation
  optimistic?: PullChange
}

/**
 * enqueueAndDrain applies the optimistic changes, queues the mutations for
 * the named partition and kicks a drain. Several mutations passed in one call
 * stay one batch in the queue.
 */
export type EnqueueAndDrain = (
  type: 'trip' | 'master',
  id: string | null,
  ...muts: QueuedMutation[]
) => void

export interface SyncContext {
  tripStore: ReturnType<typeof useTripStore>
  mutations: ReturnType<typeof useMutations>
  enqueueAndDrain: EnqueueAndDrain
}
