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
import type { useMasterStore } from '@/stores/masterStore'
import type { NameGuards } from './names'
import type { IndexedDBPersistence } from '@/local/persistence'
import type { NowIso } from '@/lib/clock'

/**
 * One queued write: the mutation itself plus the rows it optimistically
 * paints.
 *
 * Usually one row, and a delete that cascades is why it may be several. The
 * server derives a trip's child tombstones from the schema and sends them
 * with the one delete it was given (`internal/store/master.go`,
 * `cascadeChildren`); a client that must mirror that cascade has the same
 * shape to express — one mutation, several changes — and expressing it as
 * several *mutations* would push deletes the server never asked for.
 */
export interface QueuedMutation {
  mutation: Mutation
  optimistic?: PullChange | PullChange[]
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

/**
 * enqueue applies the optimistic changes and queues the mutations for the
 * named partition, without pushing. It is what a cascade writing across both
 * partitions uses — every row through the funnel, one push at the end.
 */
export type Enqueue = (
  type: 'trip' | 'master',
  id: string | null,
  ...muts: QueuedMutation[]
) => void

/**
 * drainPartitions pushes what a cascade queued: the master partition first,
 * then the named trips in order — the order the server's foreign keys
 * dictate. Fire-and-forget, and inert in Local Mode.
 */
export type DrainPartitions = (tripIds: string[]) => void

export interface SyncContext {
  tripStore: ReturnType<typeof useTripStore>
  masterStore: ReturnType<typeof useMasterStore>
  mutations: ReturnType<typeof useMutations>
  enqueueAndDrain: EnqueueAndDrain
  enqueue: Enqueue
  drainPartitions: DrainPartitions
  names: NameGuards
  /**
   * The device's own store in Local Mode, null wherever a server answers.
   * A group reads it to know whether what this device holds is the whole
   * picture — FR-24.3's reference count is exact only where it is (ADR-032).
   */
  local: IndexedDBPersistence | null
  /**
   * Today, as the device reckons it. Injected rather than read from the
   * clock so a group that decides by date — FR-27.4 only offers a group's
   * changes to a trip that has not started — is testable without one.
   */
  today: () => string
  /**
   * The moment a row is stamped with, as an ISO string. The same clock
   * `today` and the HLC read, so a retired row's `retired_at` and the HLC
   * that carries it cannot disagree about when the delete happened.
   */
  nowIso: NowIso
  /**
   * Whether this trip's own rows are on the device. The guard that keeps a
   * group from reading "not pulled yet" as "empty trip" (ADR-016), which is
   * the one way a refresh could duplicate the list it exists to keep right.
   */
  tripDataLoaded: (tripId: string) => boolean
}
