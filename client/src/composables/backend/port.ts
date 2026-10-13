import type { ComputedRef } from 'vue'

import type { PullChange } from '@/api/types'
import type { SyncOutbox } from '@/sync/outbox'
import type { PartitionRef } from '@/sync/partition'
import type { LocationFrame } from '@/sync/webSocket'
import type { PartitionBatch, QueuedMutation } from '@/sync/writeFunnel'

/**
 * Where a write goes once it is on the screen, and where the rows come from
 * (ARCH-14b). The orchestrator is built against this one shape; the mode picks
 * the implementation once, so no method below is guarded by a mode test at its
 * call site. Local Mode saves to and loads from IndexedDB; a `server` client —
 * Single-User Mode included, it is the same client without tokens — queues,
 * drains and listens.
 */
export interface SyncBackend {
  /** Every row of every trip is on this device: the stores are never partial. */
  readonly deviceHoldsEverything: boolean
  /** `null` where nothing is ever sent, so there is no queue to inspect. */
  readonly outbox: SyncOutbox | null
  /** FR-25.15: a write is on its way to being captured on this device. */
  readonly capturePending: ComputedRef<boolean>

  /** Startup: load the device (Local) or replay the queue, pull, and open the socket (Server). */
  connect(): Promise<void>
  /** The app is back in view or back online. */
  resume(): void
  disconnect(): void

  /** The stores took these changes: durable on the device in Local Mode, nothing more to do for a server. */
  applied(changes: PullChange[]): void
  /** A write is queued on its partition's feed. */
  enqueue(partition: PartitionRef, muts: QueuedMutation[]): void
  /** The batches a write queued are pushed. */
  push(batches: PartitionBatch[]): void
  /** A cascade's batches are pushed: master first, then one trip at a time. */
  drainPartitions(tripIds: string[]): void

  drainTrip(tripId: string, options?: { background?: boolean }): Promise<void>
  drainMaster(): Promise<void>
  drainAll(tripIds: string[]): Promise<void>
  /** Resolves once what is queued for the partition has reached the server. */
  whenSent(partition: PartitionRef): Promise<void>

  /** Whether this trip's rows are on the device (FR-27.4). */
  tripDataLoaded(tripId: string): boolean
  /** Whether the master partition's rows are on the device (FR-2.8). */
  masterDataLoaded(): boolean

  /** FR-4.9: the trip whose packing list is open here, `null` once none is. */
  setViewing(tripId: string | null): void
  subscribeTrip(tripId: string): void
  /** FR-29.19: shares this device's position on a trip, `null` to stop. */
  shareLocation(tripId: string, fix: LocationFrame | null): void
}
