/**
 * Sync outbox — queues local mutations and drains via push+pull (P-2, G-5).
 *
 * "Online mode" is just "outbox drains fast." All mutations go through the
 * outbox even when online, keeping the write path uniform.
 *
 * The queue is **durable** (B2, NFR-4.1): every enqueued mutation is written
 * to IndexedDB through an `OutboxStore` and removed again when the server
 * acknowledges it, so a reload or an app kill on a phone with no wifi no
 * longer throws away unsent work. `restore()` replays what an earlier
 * session left behind, before the first pull.
 *
 * Replaying is safe because the server memoizes by `mutation_id`
 * (Sync-API P-5): a second push of the same id returns `duplicate` and
 * touches neither the row nor the change log. That, and not the HLC merge,
 * is what makes a replay a no-op — the mutations themselves carry absolute
 * field values, so even without the memo a replay would be idempotent, but
 * the memo is the guarantee the client relies on.
 */

import { APIRequestError, type APIClient } from '@/api/client'
import type { Mutation, PullChange, PullResponse, PushResponse } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'
import type { OutboxStore, ParkedMutation, PartitionKey } from '@/sync/outboxStore'

type PartitionType = 'trip' | 'master'

/** A partition named the way `drain` wants it. */
export interface PartitionRef {
  type: PartitionType
  id: string | null
}

/** Server-side push limit per batch (Sync-API §9). */
const MAX_PUSH_BATCH = 200

/** The partition key prefix a trip's queue carries in storage. */
const TRIP_PREFIX = 'trip:'
/** The partition key the master feed's queue carries in storage. */
const MASTER_KEY = 'master'

/** The outcome the push endpoint reports for a mutation it will never apply. */
const OUTCOME_REJECTED = 'rejected'

/**
 * 4xx statuses a later attempt can still succeed on, so the batch behind
 * them stays queued. Everything else in the 4xx range means the server has
 * looked at this envelope and refused it — retrying forever would wedge the
 * queue and take every mutation behind it hostage.
 */
const RETRYABLE_CLIENT_STATUSES = new Set([401, 408, 425, 429])

/** The reason recorded when the server refused the envelope without words. */
const UNSPECIFIED_REJECTION = 'the server refused the change'

function partitionKey(type: PartitionType, id: string | null): PartitionKey {
  return type === 'master' ? MASTER_KEY : `${TRIP_PREFIX}${id}`
}

/** partitionRef is `partitionKey` read backwards, for the boot replay. */
function partitionRef(key: PartitionKey): PartitionRef {
  return key === MASTER_KEY
    ? { type: 'master', id: null }
    : { type: 'trip', id: key.slice(TRIP_PREFIX.length) }
}

/**
 * Whether a failed push will still be refused on every later attempt.
 * A network error is not an `APIRequestError` at all and a 5xx is the
 * server failing rather than refusing — both keep their batch queued.
 */
function isPermanentRefusal(err: unknown): err is APIRequestError {
  return (
    err instanceof APIRequestError &&
    err.status >= 400 &&
    err.status < 500 &&
    !RETRYABLE_CLIENT_STATUSES.has(err.status)
  )
}

/** Optional wiring: without a store the outbox behaves exactly as before. */
export interface SyncOutboxOptions {
  /** Where the queue is kept across sessions. Omitted → memory only. */
  store?: OutboxStore
  /** Called when a mutation is taken out of the queue for good. */
  onParked?: (entry: ParkedMutation) => void
  /**
   * Called when the device starts or stops being able to keep the queue.
   * G-2 must not promise durability it does not have (NFR-4.11).
   */
  onDurabilityChanged?: (durable: boolean) => void
  /** Injected clock — parked entries are stamped with it, never Date.now(). */
  now?: () => number
}

export class SyncOutbox {
  private queues = new Map<string, Mutation[]>()
  private cursors = new Map<string, number>()
  private readonly client: APIClient
  private readonly hlc: HLCGenerator
  private readonly onChanges: (changes: PullChange[]) => void
  private readonly store: OutboxStore | null
  private readonly onParked?: (entry: ParkedMutation) => void
  private readonly onDurabilityChanged?: (durable: boolean) => void
  private readonly now: () => number

  /** Whether the last attempt to write the queue to the device succeeded. */
  private durable = true
  /** How many mutations are parked — restored count plus this session's. */
  private parked = 0

  /**
   * Tail of the chain of storage writes issued so far. It exists so a test
   * and the e2e can await "the queue is on the device now" instead of
   * hoping — the same reason `IndexedDBPersistence` has `whenSettled`.
   */
  private persisted: Promise<void> = Promise.resolve()

  constructor(
    client: APIClient,
    hlc: HLCGenerator,
    onChanges: (changes: PullChange[]) => void,
    options: SyncOutboxOptions = {},
  ) {
    this.client = client
    this.hlc = hlc
    this.onChanges = onChanges
    this.store = options.store ?? null
    this.onParked = options.onParked
    this.onDurabilityChanged = options.onDurabilityChanged
    this.now = options.now ?? (() => Date.now())
  }

  enqueue(type: PartitionType, id: string | null, mutation: Mutation): void {
    const key = partitionKey(type, id)
    const queue = this.queues.get(key) ?? []
    queue.push(mutation)
    this.queues.set(key, queue)
    this.persist(() => this.store?.append(key, mutation))
  }

  pendingCount(type: PartitionType, id: string | null): number {
    return this.queues.get(partitionKey(type, id))?.length ?? 0
  }

  totalPending(): number {
    let total = 0
    for (const q of this.queues.values()) {
      total += q.length
    }
    return total
  }

  /** How many mutations the server refused and this device kept as evidence. */
  parkedCount(): number {
    return this.parked
  }

  /** The parked mutations themselves, for the G-2 detail and the conflict log. */
  loadParked(): Promise<ParkedMutation[]> {
    return this.store?.loadParked() ?? Promise.resolve([])
  }

  /** Whether the queue is currently being kept on the device (NFR-4.1). */
  isDurable(): boolean {
    return this.durable && this.store !== null
  }

  /** Resolves once every storage write issued so far has settled. */
  whenPersisted(): Promise<void> {
    return this.persisted
  }

  /**
   * restore rebuilds the in-memory queue from the device and reports which
   * partitions have work waiting, so the caller can drain them on boot
   * *before* the first pull. Without a store it is a no-op.
   */
  async restore(): Promise<PartitionRef[]> {
    if (!this.store) return []
    let pending
    try {
      pending = await this.store.loadPending()
      this.parked = (await this.store.loadParked()).length
    } catch {
      // A browser with IndexedDB switched off fails here, on the boot path.
      // Losing durability is a degradation; taking `connect()` down with it
      // would be an outage in a mode that otherwise works perfectly.
      this.setDurable(false)
      return []
    }
    const order: string[] = []
    for (const { partition, mutation } of pending) {
      const queue = this.queues.get(partition)
      if (queue) {
        queue.push(mutation)
      } else {
        this.queues.set(partition, [mutation])
        order.push(partition)
      }
    }
    return order.map(partitionRef)
  }

  /** Push pending mutations then pull canonical state. */
  async drain(type: PartitionType, id: string | null): Promise<void> {
    const key = partitionKey(type, id)
    const queue = this.queues.get(key) ?? []

    if (queue.length > 0) {
      const path = this.syncPath(type, id)
      // The server caps a push at 200 mutations (Sync-API §9) — chunk
      // big batches (e.g. wizard-generated trips) instead of getting the
      // whole queue rejected. `queue` is the snapshot this drain works
      // through; the live queue is what gets shortened, so a mutation
      // enqueued mid-drain is neither pushed twice nor dropped.
      for (let offset = 0; offset < queue.length; offset += MAX_PUSH_BATCH) {
        const chunk = queue.slice(offset, offset + MAX_PUSH_BATCH)
        let resp: PushResponse
        try {
          resp = await this.client.post<PushResponse>(path, {
            client_hlc: this.hlc.next(),
            mutations: chunk,
          })
        } catch (err) {
          if (!isPermanentRefusal(err)) throw err
          // The server has seen this envelope and will refuse it again.
          // Keeping it would take the whole partition hostage, so it is
          // parked — out of the queue, still on the device as evidence.
          this.parkAll(key, chunk, err.message)
          continue
        }
        // `resp.pull_hint.next_cursor` is deliberately not adopted as the
        // pull cursor: it is the seq *this push* just wrote, so starting
        // there would skip everything another device wrote in between —
        // permanently, the cursor being an exclusive lower bound (§4). It
        // says a pull is worth making, which the drain does unconditionally.

        // Park before forgetting, not after: the two are separate storage
        // writes, and a device that died between them would have dropped a
        // refused mutation without leaving the evidence behind.
        const parked = this.parkRejected(key, chunk, resp)
        // Drop what was pushed by id rather than by count: the chunk and
        // the live queue can have drifted apart while the request was open.
        this.forget(
          key,
          chunk.filter((m) => !parked.has(m.mutation_id)),
        )
      }
    }

    const pullResp = await this.client.get<PullResponse>(this.syncPath(type, id), {
      cursor: String(this.cursors.get(key) ?? 0),
      limit: '500',
    })

    if (pullResp.changes.length > 0) {
      this.onChanges(pullResp.changes)
      for (const c of pullResp.changes) {
        if (c.row && typeof c.row['updated_hlc'] === 'string') {
          this.hlc.observe(c.row['updated_hlc'])
        }
      }
    }

    this.cursors.set(key, pullResp.next_cursor)
  }

  private syncPath(type: PartitionType, id: string | null): string {
    return type === 'master' ? '/api/v1/sync/master' : `/api/v1/sync/trips/${id}`
  }

  /** Removes pushed mutations from the live queue and from the device. */
  private forget(key: string, chunk: Mutation[]): void {
    const pushed = new Set(chunk.map((m) => m.mutation_id))
    const live = this.queues.get(key) ?? []
    this.queues.set(
      key,
      live.filter((m) => !pushed.has(m.mutation_id)),
    )
    this.persist(() => this.store?.remove([...pushed]))
  }

  /**
   * Parks every mutation the push response reports as rejected (§9) and
   * reports which ids those were, so the caller does not also delete them.
   */
  private parkRejected(key: string, chunk: Mutation[], resp: PushResponse): Set<string> {
    const rejected = new Map(
      resp.results.filter((r) => r.outcome === OUTCOME_REJECTED).map((r) => [r.mutation_id, r]),
    )
    const parked = new Set<string>()
    if (rejected.size === 0) return parked
    for (const mutation of chunk) {
      const result = rejected.get(mutation.mutation_id)
      if (!result) continue
      this.park(key, mutation, result.error ?? UNSPECIFIED_REJECTION)
      parked.add(mutation.mutation_id)
    }
    return parked
  }

  private parkAll(key: string, chunk: Mutation[], reason: string): void {
    for (const mutation of chunk) this.park(key, mutation, reason)
  }

  /**
   * Takes one mutation out of the queue for good. The storage write moves it
   * from the pending store to the parked one in a single transaction, so it
   * is never in both and never in neither.
   */
  private park(key: string, mutation: Mutation, reason: string): void {
    const live = this.queues.get(key) ?? []
    this.queues.set(
      key,
      live.filter((m) => m.mutation_id !== mutation.mutation_id),
    )
    const entry: ParkedMutation = { partition: key, mutation, reason, at: this.now() }
    this.parked++
    this.persist(() => this.store?.park(key, mutation, reason, entry.at))
    this.onParked?.(entry)
  }

  /**
   * Runs one storage write on the chain, and turns its outcome into the
   * durability signal G-2 reads. A refused write (quota, an aborted
   * transaction) never loses the mutation — it stays in memory and is still
   * pushed; what is lost is the promise that it would survive a reload, and
   * that is what gets announced.
   */
  private persist(write: () => Promise<void> | undefined): void {
    this.persisted = this.persisted.then(async () => {
      if (!this.store) return
      try {
        await write()
        this.setDurable(true)
      } catch {
        this.setDurable(false)
      }
    })
  }

  private setDurable(next: boolean): void {
    if (this.durable === next) return
    this.durable = next
    this.onDurabilityChanged?.(next)
  }

  getCursor(type: PartitionType, id: string | null): number {
    return this.cursors.get(partitionKey(type, id)) ?? 0
  }
}
