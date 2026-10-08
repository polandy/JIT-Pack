/**
 * One hand-written `SyncContext` for the seam specs — no `fetch`, no
 * WebSocket, no outbox, no orchestrator, and the production write funnel
 * over a recording queue.
 *
 * It is shared rather than repeated per spec so that growing `SyncContext`
 * costs one edit, and the compiler still names it: a new field is a TS2739
 * here rather than a silently half-built context in four places.
 */
import { createNameGuards } from '../names'
import { knownTripItemsOf } from '../context'
import type { QueuedMutation, SyncContext } from '../context'
import type { PullChange } from '@/api/types'
import type { IndexedDBPersistence } from '@/local/persistence'
import { createMutations } from '@/sync/mutations'
import { HLCGenerator } from '@/sync/hlc'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { storeFor } from '@/sync/routing'
import { changesOf as unfold } from '@/sync/optimistic'
import type { PartitionType } from '@/sync/partition'
import { createWriteFunnel } from '@/sync/writeFunnel'

/** One queued batch — one feed's share of a `write` or `queue` call — in the order the group made it. */
export interface Recorded {
  type: PartitionType
  id: string | null
  muts: QueuedMutation[]
  /** Whether the write pushed itself (`write`) or left that to a cascade's
   * own `drainPartitions`. */
  drained: boolean
}

/**
 * makeSeamContext builds the context and the log its write funnel
 * records to. Pinia must already be active.
 *
 * `local` decides the mode the group is asked in: null is Server Mode, any
 * store is Local Mode. It is only ever compared against null by the groups,
 * so a spec that needs Local Mode passes an empty stand-in.
 *
 * `today` and `tripDataLoaded` default to the two answers a group is normally
 * asked under — a fixed date, and rows that are on the device. A spec that is
 * *about* the other answer overrides it; a spec that is not must not have to
 * know they exist.
 */
export const SEAM_TODAY = '2026-06-01'

/**
 * The instant a seam-context row is stamped with. On SEAM_TODAY, so a
 * spec that reads both sees one day rather than two.
 */
export const SEAM_NOW_ISO = '2026-06-01T09:00:00.000Z'

/**
 * The context a seam spec gets, whose two stores are the real pinia ones.
 *
 * Wider than `SyncContext` on purpose: production hands a group only the
 * getters it reads (`TripReads`/`MasterReads`), and a spec has to *look* at
 * what the group painted — `getItemComments`, `getItemDependencies` and the
 * rest are the assertion, not the subject. Keeping them here rather than in
 * the context is what lets the context stay the narrow thing.
 */
export type SeamContext = SyncContext & {
  tripStore: ReturnType<typeof useTripStore>
  masterStore: ReturnType<typeof useMasterStore>
}

export function makeSeamContext(
  opts: {
    local?: IndexedDBPersistence | null
    today?: string
    tripDataLoaded?: (tripId: string) => boolean
  } = {},
): {
  ctx: SeamContext
  queued: Recorded[]
  /** One entry per `drainPartitions` call, in order — the trips it pushed. */
  drains: string[][]
} {
  const queued: Recorded[] = []
  const drains: string[][] = []
  const masterStore = useMasterStore()
  const tripStore = useTripStore()

  /**
   * The production funnel, bound to the real stores and a recording queue —
   * so the partition and the paint a spec sees are the ones a device would
   * produce, not a second derivation of them here. Routed by table through
   * the same module production routes with: routing by partition would put
   * the master partition's per-trip tables (P-3) into the wrong store the
   * moment a group painted rows of both.
   */
  let drained = false
  const funnel = createWriteFunnel({
    currentRow: (table, id) => {
      const owner = storeFor(table)
      if (owner === 'trip') return tripStore.currentRow(table, id)
      if (owner === 'master') return masterStore.currentRow(table, id)
      return undefined
    },
    paint: (changes) => {
      for (const change of changes) {
        const target = storeFor(change.table)
        if (target === 'trip') applyTo(tripStore, change)
        else if (target === 'master') applyTo(masterStore, change)
      }
    },
    queue: ({ partition, muts }) => {
      queued.push({ type: partition.type, id: partition.id, muts, drained })
    },
  })
  const ctx: SeamContext = {
    tripStore,
    masterStore,
    features: [],
    mutations: createMutations(new HLCGenerator(() => 1, 'aabbccdd'), () => SEAM_NOW_ISO),
    write: (...writes) => {
      drained = true
      funnel.queueWrites(...writes)
    },
    queue: (...writes) => {
      // A cascade queues without pushing; the paint is the same one, so the
      // log records the call under `drained: false` — a spec about ordering
      // reads one log, not two.
      drained = false
      funnel.queueWrites(...writes)
    },
    drainPartitions: (tripIds) => {
      drains.push([...tripIds])
    },
    names: createNameGuards(masterStore),
    local: opts.local ?? null,
    today: () => opts.today ?? SEAM_TODAY,
    nowIso: () => SEAM_NOW_ISO,
    tripDataLoaded: opts.tripDataLoaded ?? (() => true),
    knownTripItems: () => knownTripItemsOf(tripStore),
  }
  return { ctx, queued, drains }
}

/** The optimistic changes of one queued mutation, none or many alike. */
export function changesOf(mut: QueuedMutation): PullChange[] {
  return unfold(mut.optimistic)
}

/**
 * The single row one queued write paints. Throws where a write painted none
 * or several, so a spec reading `.row` cannot silently read the wrong change
 * of a cascade.
 */
export function paintedRow(mut: QueuedMutation): Record<string, unknown> | null {
  const changes = changesOf(mut)
  if (changes.length !== 1) {
    throw new Error(`expected one painted change, got ${changes.length}`)
  }
  return changes[0]!.row as Record<string, unknown> | null
}

/** Hands one change to a store the way the pull router would. */
function applyTo(store: { $id: string }, change: PullChange): void {
  ;(store as unknown as { applyChange: (c: PullChange) => void }).applyChange(change)
}

/** Seeds one row into a store the way a pull would, so the store maps it itself. */
export function pullIn(store: { $id: string }, table: string, id: string, row: object): void {
  ;(store as unknown as { applyChange: (c: never) => void }).applyChange({
    seq: 1,
    table,
    id,
    deleted: false,
    row,
  } as never)
}
