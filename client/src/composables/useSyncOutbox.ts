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

import { API } from '@/api/routes'
import { APIRequestError, type APIClient } from '@/api/client'
import type { Mutation, PullChange, PullResponse, PushResponse } from '@/api/types'
import { observeRemote, type HLCGenerator } from '@/sync/hlc'
import type { OutboxStore, ParkedMutation, PartitionKey } from '@/sync/outboxStore'
import { REJECTION_REASON } from '@/sync/rejectionReasons'

type PartitionType = 'trip' | 'master'

/** A partition named the way `drain` wants it. */
export interface PartitionRef {
  type: PartitionType
  id: string | null
}

/** Server-side push limit per batch (Sync-API §9). */
export const MAX_PUSH_BATCH = 200

/**
 * How many changes one pull asks for (Sync-API §4). Module-private: unlike
 * `MAX_PUSH_BATCH`, which the command line has to respect too, nothing
 * outside this file decides how big a page is.
 */
const PULL_PAGE_SIZE = 500

/** The partition key prefix a trip's queue carries in storage. */
const TRIP_PREFIX = 'trip:'
/** The partition key the master feed's queue carries in storage. */
const MASTER_KEY = 'master'

/** The outcome the push endpoint reports for a mutation it will never apply. */
const OUTCOME_REJECTED = 'rejected'
const OUTCOME_MERGED = 'merged'

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

/**
 * What one push had refused, and why (Sync-API §5, ADR-031).
 *
 * Reported per *push* rather than per mutation, for the same reason the
 * conflict report is: a reconnect drains a whole queue, and a refusal that
 * repeats across it would stack a wall of identical signals.
 */
export interface RejectionReport {
  /** How many mutations of this push the server refused. */
  count: number
  /** The reason of the last of them — the closed vocabulary of §5. */
  reason: string
  type: PartitionType
  id: string | null
}

/** What one push lost, and where to go and look at it (NFR-4.2a). */
export interface ConflictReport {
  /** Fields the server dropped across every mutation of this push. */
  count: number
  type: PartitionType
  id: string | null
}

/** Optional wiring: without a store the outbox behaves exactly as before. */
export interface SyncOutboxOptions {
  /** Where the queue is kept across sessions. Omitted → memory only. */
  store?: OutboxStore
  /** Called when a mutation is taken out of the queue for good. */
  onParked?: (entry: ParkedMutation) => void
  /**
   * Called after a push whose answer says the server dropped fields of this
   * device's changes (NFR-4.2a `merged`). The partition travels with the
   * count because it decides which of the two conflict logs the user is
   * being pointed at.
   */
  onConflicts?: (report: ConflictReport) => void
  /**
   * Called after a push the server refused mutations of. The repair itself
   * needs no caller — it arrives through the ordinary pull, or is applied
   * locally — so this exists only to say that it happened: a row that
   * changes back under the user's hands with nothing said is its own defect
   * (ADR-031).
   */
  onRejections?: (report: RejectionReport) => void
  /**
   * Called when the device starts or stops being able to keep the queue.
   * G-2 must not promise durability it does not have (NFR-4.11).
   */
  onDurabilityChanged?: (durable: boolean) => void
  /**
   * How many of this device's own edits are still on their way into the
   * queue's storage (FR-25.15). Deliberately narrower than the queue: a
   * mutation the server has taken is captured, and a drain rewriting the
   * queue is not an edit — so only `enqueue` moves this number.
   */
  onCaptureChanged?: (uncaptured: number) => void
  /** Injected clock — parked entries are stamped with it, never Date.now(). */
  now?: () => number
}

export class SyncOutbox {
  private queues = new Map<string, Mutation[]>()
  private cursors = new Map<string, number>()
  /** The drain currently running for a partition, while one is (see `drain`). */
  private draining = new Map<string, Promise<void>>()
  /** The one follow-up drain already promised to callers that arrived too late. */
  private queuedDrain = new Map<string, Promise<void>>()
  private readonly client: APIClient
  private readonly hlc: HLCGenerator
  private readonly onChanges: (changes: PullChange[]) => void
  private readonly store: OutboxStore | null
  private readonly onParked?: (entry: ParkedMutation) => void
  private readonly onConflicts?: (report: ConflictReport) => void
  private readonly onRejections?: (report: RejectionReport) => void
  private readonly onDurabilityChanged?: (durable: boolean) => void
  private readonly onCaptureChanged?: (uncaptured: number) => void
  private readonly now: () => number

  /** Whether the last attempt to write the queue to the device succeeded. */
  private durable = true
  /** How many mutations are parked — restored count plus this session's. */
  private parked = 0
  /** The reason of the most recent refusal, which is the one G-2 names. */
  private lastReason: string | null = null
  /** Edits enqueued but not yet written to the device (FR-25.15). */
  private uncaptured = 0

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
    this.onConflicts = options.onConflicts
    this.onRejections = options.onRejections
    this.onDurabilityChanged = options.onDurabilityChanged
    this.onCaptureChanged = options.onCaptureChanged
    this.now = options.now ?? (() => Date.now())
  }

  enqueue(type: PartitionType, id: string | null, mutation: Mutation): void {
    const key = partitionKey(type, id)
    const queue = this.queues.get(key) ?? []
    queue.push(mutation)
    this.queues.set(key, queue)
    this.setUncaptured(this.uncaptured + 1)
    this.persist(() => this.store?.append(key, mutation))
    // `persist` has just extended the chain, so its tail is this append.
    // A device with no store resolves at once, which is the honest answer:
    // there is nothing left for the edit to arrive in.
    void this.persisted.then(() => this.setUncaptured(this.uncaptured - 1))
  }

  private setUncaptured(next: number): void {
    this.uncaptured = next
    this.onCaptureChanged?.(next)
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

  /**
   * Why the most recent parked mutation was refused (Sync-API §5), or null
   * when nothing has been refused. A count on its own tells the user that
   * something of theirs is gone but not what — and the row is usually still
   * on their screen, because the delete rendered optimistically.
   */
  lastParkedReason(): string | null {
    return this.lastReason
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
      const parked = await this.store.loadParked()
      this.parked = parked.length
      // Oldest first, so the reason to show is the tail's.
      this.lastReason = parked.length > 0 ? parked[parked.length - 1]!.reason : null
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

  /**
   * Push pending mutations then pull canonical state — one drain per
   * partition at a time.
   *
   * Most callers do not await this: the WebSocket's `master.changed` handler
   * fires it and moves on, and so do the trip actions. Two of them landing on
   * top of each other pushed the same chunk twice and pulled the same pages
   * twice, which since the feed became a *paged* one costs the whole
   * partition rather than one request.
   *
   * A late caller waits for a **further** drain rather than being handed the
   * running one: a drain works through the snapshot of the queue it took when
   * it started, so handing back the running promise would report a mutation
   * enqueued since then as sent while it had never left the device. Every
   * caller that arrives during one drain shares that single follow-up.
   */
  drain(type: PartitionType, id: string | null): Promise<void> {
    const key = partitionKey(type, id)
    const running = this.draining.get(key)
    if (!running) {
      // `finally` and not `then`: a drain that fails must release the
      // partition, or one lost network moment would take it out of sync for
      // the rest of the session.
      // Nothing else can have registered a drain for this partition in the
      // meantime — that is what the map is for — so the entry this clears is
      // always this drain's own.
      const started = this.runDrain(type, id).finally(() => this.draining.delete(key))
      this.draining.set(key, started)
      return started
    }
    const promised = this.queuedDrain.get(key)
    if (promised) return promised
    // The running drain's failure belongs to whoever started it; this caller
    // gets the outcome of its own drain, which has not happened yet.
    const follow = running
      .catch(() => {})
      .then(() => {
        this.queuedDrain.delete(key)
        return this.drain(type, id)
      })
    this.queuedDrain.set(key, follow)
    return follow
  }

  private async runDrain(type: PartitionType, id: string | null): Promise<void> {
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
        // Park before forgetting, not after: the two are separate storage
        // writes, and a device that died between them would have dropped a
        // refused mutation without leaving the evidence behind.
        const parked = this.parkRejected(key, chunk, resp)
        this.repairRejected(type, id, chunk, resp)
        this.reportConflicts(type, id, resp)
        // Drop what was pushed by id rather than by count: the chunk and
        // the live queue can have drifted apart while the request was open.
        this.forget(
          key,
          chunk.filter((m) => !parked.has(m.mutation_id)),
        )
      }
    }

    // From the last cursor a *pull* returned — never from the push's
    // `pull_hint`, which names the seq that push just wrote and would step
    // over everything another device wrote in between. The cursor is an
    // exclusive lower bound (Sync-API §4) and only moves forward, so what it
    // steps over is never offered again. The hint says a pull is worth
    // making, which the drain does unconditionally.
    //
    // A page at a time until the server says there is no more: a partition is
    // routinely larger than one page — a decade of trips is — and taking only
    // the first one delivered a device a fraction of the instance while the
    // G-2 glyph read *synced*. Each page is applied and its cursor recorded
    // before the next is asked for, so a feed interrupted halfway keeps what
    // it already has rather than paying for it again.
    let hasMore = true
    while (hasMore) {
      const cursor = this.getCursor(type, id)
      const pullResp = await this.client.get<PullResponse>(this.syncPath(type, id), {
        cursor: String(cursor),
        limit: String(PULL_PAGE_SIZE),
      })

      if (pullResp.changes.length > 0) {
        this.onChanges(pullResp.changes)
        for (const c of pullResp.changes) {
          if (c.row && typeof c.row['updated_hlc'] === 'string') {
            // See observeRemote: one unusable clock must not cost the page.
            observeRemote(this.hlc, c.row['updated_hlc'])
          }
        }
      }

      this.cursors.set(key, pullResp.next_cursor)
      // A server that claims more and does not move the cursor would spin
      // this loop for ever — a hung tab on the boot path, which is worse
      // than a short feed. Progress is the condition, not the claim.
      hasMore = pullResp.has_more && pullResp.next_cursor > cursor
    }
  }

  // The id is nullable because the master partition has none. A *trip*
  // partition without one is a programming error, and it used to interpolate
  // as the string "null" — a request the server answers 404 and the outbox
  // retries forever, naming nothing. Typed route builders made it visible.
  private syncPath(type: PartitionType, id: string | null): string {
    if (type === 'master') return API.masterSync
    if (id === null) throw new Error('a trip partition needs a trip id')
    return API.tripSync(id)
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
   * Tells the caller how many fields this push lost. A `merged` mutation
   * *did* apply — it is forgotten like any other, never parked — so without
   * this the whole outcome was indistinguishable from `applied` and the
   * user was never told an edit of theirs had been overwritten.
   */
  private reportConflicts(type: PartitionType, id: string | null, resp: PushResponse): void {
    if (!this.onConflicts) return
    let count = 0
    for (const result of resp.results) {
      if (result.outcome === OUTCOME_MERGED) count += result.conflicts?.length ?? 0
    }
    if (count > 0) this.onConflicts({ count, type, id })
  }

  /**
   * Closes the divergence a refusal leaves behind (ADR-031), and says that
   * it happened.
   *
   * The server repairs what it can: it re-logs the row it refused, so the
   * pull this drain makes next carries the truth and replaces the optimistic
   * copy. The one refusal it cannot re-log is `out_of_scope` — the row
   * belongs to another trip, and an entry for it in this partition would
   * hand over a foreign row's snapshot (P-3). That one is repaired here,
   * with what the client already knows: a row this partition may not touch
   * is a row this partition must not keep.
   */
  private repairRejected(
    type: PartitionType,
    id: string | null,
    chunk: Mutation[],
    resp: PushResponse,
  ): void {
    const refused = new Map(
      resp.results.filter((r) => r.outcome === OUTCOME_REJECTED).map((r) => [r.mutation_id, r]),
    )
    if (refused.size === 0) return

    const dropped: PullChange[] = []
    let last = UNSPECIFIED_REJECTION
    for (const mutation of chunk) {
      const result = refused.get(mutation.mutation_id)
      if (!result) continue
      last = result.error ?? UNSPECIFIED_REJECTION
      if (result.error === REJECTION_REASON.outOfScope) {
        dropped.push({ seq: 0, table: mutation.table, id: mutation.id, deleted: true, row: null })
      }
    }
    if (dropped.length > 0) this.onChanges(dropped)
    this.onRejections?.({ count: refused.size, reason: last, type, id })
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
    this.lastReason = reason
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

  /** The last `next_cursor` a pull of this partition returned; 0 until one has. */
  getCursor(type: PartitionType, id: string | null): number {
    return this.cursors.get(partitionKey(type, id)) ?? 0
  }
}
