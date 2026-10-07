/**
 * The write funnel: every mutation a device makes passes here on its way to
 * the stores and the outbox.
 *
 * A caller hands over the mutation and nothing else. The funnel decides the
 * two things every call site used to restate — which feed the write travels,
 * and what it paints — so neither can be got wrong at the call site:
 *
 * - **The partition** comes from the table (`partitionOf`, Sync-API P-3), and
 *   a trip-feed row's trip from the row itself: every trip-feed table carries
 *   `trip_id`, in the mutation's fields for an insert and in the store's row
 *   for anything else.
 * - **The paint** comes from the op: an insert shows its fields, a delete its
 *   tombstone, and an upsert is laid over the row **as the store holds it
 *   now** — never over a snapshot the caller took earlier, which would also
 *   revert whatever landed in between (a pull, another device's write).
 *
 * The rows a caller still paints itself — a cascade's tombstones, a full row
 * upserted as a whole — are passed as a `QueuedMutation`, whose paint the
 * funnel takes as given.
 */

import type { Mutation, PullChange } from '@/api/types'
import { MASTER_PARTITION, tripPartition, type PartitionRef } from './partition'
import { changesOf, optimisticDelete, optimisticInsert, optimisticUpdate } from './optimistic'
import { partitionOf } from './routing'
import type { SyncRow } from './tableRegistry'

/**
 * One queued write with the rows it paints, spelled out by the caller.
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

/** A write as a caller hands it over: the mutation alone, or with its paint. */
export type Write = Mutation | QueuedMutation

/** The writes of one call that travel one feed, in the order they were made. */
export interface PartitionBatch {
  partition: PartitionRef
  muts: QueuedMutation[]
}

/** What the funnel reads and drives; the orchestrator and the seam double each supply one. */
export interface WriteFunnelDeps {
  /** The row as the stores hold it now, in its wire shape — undefined where none does. */
  currentRow(table: string, id: string): SyncRow | undefined
  /** Feeds optimistic changes to the stores, as a pull would. */
  paint(changes: PullChange[]): void
  /** Queues one feed's mutations; several in one call stay one batch. */
  queue(batch: PartitionBatch): void
}

function isQueued(write: Write): write is QueuedMutation {
  return 'mutation' in write
}

/** The mutation a write stands for, whichever form it was handed over in. */
export function mutationOf(write: Write): Mutation {
  return isQueued(write) ? write.mutation : write
}

/**
 * paintOf is the default paint of a mutation, given the row it addresses as
 * the stores hold it. Undefined for an upsert of a row the device does not
 * hold: there is nothing on screen to change, and painting the fields alone
 * would show a row with every other column blank.
 */
export function paintOf(mutation: Mutation, current: SyncRow | undefined): PullChange | undefined {
  if (mutation.op === 'insert') return optimisticInsert(mutation)
  if (mutation.op === 'delete') return optimisticDelete(mutation)
  return current && optimisticUpdate(mutation, current)
}

/** The trip a row belongs to, read off whatever of it is to hand. */
function tripOf(...rows: (SyncRow | null | undefined)[]): string | undefined {
  for (const row of rows) {
    const id = row?.['trip_id']
    if (typeof id === 'string') return id
  }
  return undefined
}

/**
 * createWriteFunnel binds the funnel to its stores and queue. `queueWrites`
 * paints and queues and returns the batches it queued; pushing them is the
 * caller's, so a cascade across both feeds can queue several calls and push
 * once.
 */
export function createWriteFunnel(deps: WriteFunnelDeps) {
  /**
   * Resolves one write, or returns null for a write that addresses a row the
   * device no longer holds. Such a write is dropped whole: re-upserting a row
   * somebody deleted, here or on another device, would resurrect it, and a
   * trip-feed row with no row to read its trip from has no feed to go to.
   */
  function resolve(write: Write): { partition: PartitionRef; queued: QueuedMutation } | null {
    const mutation = mutationOf(write)
    const current = deps.currentRow(mutation.table, mutation.id)
    let queued: QueuedMutation
    if (isQueued(write)) {
      queued = write
    } else {
      if (mutation.op !== 'insert' && !current) return null
      queued = { mutation, optimistic: paintOf(mutation, current) }
    }
    const feed = partitionOf(mutation.table)
    if (feed === null) throw new Error(`${mutation.table} travels no feed`)
    if (feed === 'master') return { partition: MASTER_PARTITION, queued }
    const painted = changesOf(queued.optimistic).find((c) => c.id === mutation.id)?.row
    const tripId = tripOf(mutation.fields, current, painted as SyncRow | null | undefined)
    if (tripId === undefined) {
      if (!isQueued(write)) return null
      throw new Error(`${mutation.table} ${mutation.id}: no trip to queue it for`)
    }
    return { partition: tripPartition(tripId), queued }
  }

  function queueWrites(...writes: Write[]): PartitionBatch[] {
    const batches: PartitionBatch[] = []
    for (const write of writes) {
      // Resolved one at a time, after the previous write has painted: a
      // write that follows its own insert in one call reads that row back.
      const resolved = resolve(write)
      if (!resolved) continue
      const { partition, queued } = resolved
      const painted = changesOf(queued.optimistic)
      if (painted.length > 0) deps.paint(painted)
      let batch = batches.find(
        (b) => b.partition.type === partition.type && b.partition.id === partition.id,
      )
      if (!batch) {
        batch = { partition, muts: [] }
        batches.push(batch)
      }
      batch.muts.push(queued)
    }
    // The master feed first: a trip's rows are refused until the trips row
    // and the creator's membership exist there (Sync-API P-3).
    const sorted = [
      ...batches.filter((b) => b.partition.type === 'master'),
      ...batches.filter((b) => b.partition.type === 'trip'),
    ]
    for (const batch of sorted) deps.queue(batch)
    return sorted
  }

  return { queueWrites }
}
