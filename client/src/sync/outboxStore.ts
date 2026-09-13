/**
 * Durable sync outbox storage (B2, NFR-4.1).
 *
 * The outbox used to be a JS array: a reload or an app kill while offline
 * threw away every mutation that had not reached the server. On a phone in
 * a hotel with no wifi that is the ordinary case, not the edge case, so the
 * queue lives in IndexedDB and is replayed on boot before the first pull.
 *
 * Replaying is safe because the server memoizes by `mutation_id`
 * (Sync-API P-5, `mutations` table): a mutation pushed twice comes back
 * `duplicate` and touches neither the row nor the change log. The mutation
 * id is minted once, at enqueue time, and is stored with the mutation — a
 * replay that re-minted it would be a second write, not a retry.
 *
 * The database is deliberately its own (`jitpack-outbox`) and not a store
 * inside `jitpack-local`: the Local Mode row store is the *data* in the one
 * mode that has no server, this is *unsent traffic* in the mode that does.
 * They have different lifetimes and only ever one of them is in use.
 */

import type { Mutation } from '@/api/types'

const DB_NAME = 'jitpack-outbox'
const DB_VERSION = 1
/**
 * How long one `indexedDB.open()` may take before the queue is declared
 * unusable. Generous, because a cold start on a phone with a large database
 * is slow and a queue wrongly given up on costs durability; bounded, because
 * the alternative is the boot path waiting for ever (see `open`).
 */
const OPEN_TIMEOUT_MS = 8_000
/** Mutations enqueued and not yet acknowledged by the server. */
const PENDING = 'pending'
/** Mutations the server will never accept — out of the queue, kept as evidence. */
const PARKED = 'parked'
/** Index carrying the append order across sessions. */
const BY_SEQ = 'by_seq'

/**
 * The partition a mutation belongs to, in the outbox's own key form:
 * `master` or `trip:<id>`. Kept as the opaque string the outbox already
 * uses so storage never has to know the partition grammar.
 */
export type PartitionKey = string

/** Why the outbox database could not be opened — the two silent cases. */
export type OutboxOpenFailure = 'blocked' | 'timeout'

/**
 * The queue's storage could not be opened, in a way IndexedDB itself never
 * reports as an error.
 *
 * `blocked` is another connection holding the database at a different
 * version — on iOS the installed PWA and a Safari tab on the same origin,
 * which is the ordinary case rather than the exotic one. `timeout` is the
 * open neither succeeding nor failing for {@link OPEN_TIMEOUT_MS}. Both used
 * to leave the returned promise pending for ever, and with it the boot path
 * that awaits it: no error, no glyph change, no trips.
 */
export class OutboxUnavailableError extends Error {
  constructor(public readonly failure: OutboxOpenFailure) {
    super(`outbox storage ${failure}`)
    this.name = 'OutboxUnavailableError'
  }
}

/** Wiring for the one real store; both halves exist for the failure tests. */
export interface IndexedDBOutboxStoreOptions {
  /** Deadline for one open. Defaults to {@link OPEN_TIMEOUT_MS}. */
  openTimeoutMs?: number
  /**
   * Timer seam: runs `fn` after `ms` and returns the canceller. Injected so
   * the deadline can be reached deliberately instead of waited for — the
   * same reason the sync layer injects its clock.
   */
  startTimer?: (ms: number, fn: () => void) => () => void
}

/** Real timers, used wherever no seam was supplied. */
const defaultStartTimer = (ms: number, fn: () => void): (() => void) => {
  const handle = setTimeout(fn, ms)
  return () => clearTimeout(handle)
}

/** One queued, not-yet-pushed mutation as it comes back from storage. */
export interface PendingMutation {
  partition: PartitionKey
  mutation: Mutation
}

/** One mutation the server permanently rejected, with the reason it gave. */
export interface ParkedMutation {
  partition: PartitionKey
  mutation: Mutation
  /** The server's own words — an API error message or a rejected outcome. */
  reason: string
  /** Epoch-ms the mutation was parked. */
  at: number
}

/**
 * The seam the outbox writes through. Small and consumer-side on purpose:
 * the failure-path tests drive a hand-written fake, and the one real
 * implementation is `IndexedDBOutboxStore` below.
 */
export interface OutboxStore {
  /** Every unacknowledged mutation, oldest first. */
  loadPending(): Promise<PendingMutation[]>
  /** Adds one mutation to the tail of the queue. */
  append(partition: PartitionKey, mutation: Mutation): Promise<void>
  /** Drops acknowledged mutations by id. Unknown ids are ignored. */
  remove(mutationIds: string[]): Promise<void>
  /** Moves a mutation out of the queue and into the parked list. */
  park(partition: PartitionKey, mutation: Mutation, reason: string, at: number): Promise<void>
  /** Every parked mutation, oldest first. */
  loadParked(): Promise<ParkedMutation[]>
  /** Resolves once every write issued so far has finished (or failed). */
  whenSettled(): Promise<void>
}

interface PendingRecord {
  mutation_id: string
  seq: number
  partition: PartitionKey
  mutation: Mutation
}

interface ParkedRecord extends PendingRecord {
  reason: string
  at: number
}

/** IndexedDB implementation of {@link OutboxStore}. */
export class IndexedDBOutboxStore implements OutboxStore {
  private db: Promise<IDBDatabase> | null = null

  /**
   * Writes run one after another and `settled` is the tail of that chain —
   * the same discipline as `@/local/persistence`, for the same two reasons.
   * A mutation enqueued and followed immediately by a reload was otherwise
   * written into a transaction the navigation cancelled, which is exactly
   * the data loss this file exists to stop; and chaining removes the
   * interleaving two overlapping writes of the same key would allow.
   */
  private settled: Promise<void> = Promise.resolve()

  /**
   * Next append order number. Seeded from the stored maximum when the
   * database opens, so a session that appends without having read the
   * previous session's tail still sorts after it.
   */
  private seq = 0

  private readonly openTimeoutMs: number
  private readonly startTimer: (ms: number, fn: () => void) => () => void

  constructor(options: IndexedDBOutboxStoreOptions = {}) {
    this.openTimeoutMs = options.openTimeoutMs ?? OPEN_TIMEOUT_MS
    this.startTimer = options.startTimer ?? defaultStartTimer
  }

  whenSettled(): Promise<void> {
    return this.settled
  }

  /**
   * Opens the database, and always settles.
   *
   * `onsuccess` and `onerror` are not the whole story: an open the browser
   * *blocks* fires neither, and a wedged IndexedDB fires nothing at all.
   * Either left this promise pending, and `connect()` awaits it on the boot
   * path — the app came up with no trips, no error and the glyph still
   * saying what it said before. The service worker's own open has handled
   * `onblocked` since it was written (`client/public/sw.js`); this one had
   * neither that nor a deadline.
   */
  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      const cancelDeadline = this.startTimer(this.openTimeoutMs, () =>
        reject(new OutboxUnavailableError('timeout')),
      )
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(PENDING)) {
          db.createObjectStore(PENDING, { keyPath: 'mutation_id' }).createIndex(BY_SEQ, 'seq')
        }
        if (!db.objectStoreNames.contains(PARKED)) {
          db.createObjectStore(PARKED, { keyPath: 'mutation_id' }).createIndex(BY_SEQ, 'seq')
        }
      }
      req.onsuccess = () => {
        cancelDeadline()
        resolve(req.result)
      }
      req.onerror = () => {
        cancelDeadline()
        reject(req.error)
      }
      // Another connection holds the database at a different version. It may
      // yet be released, but nothing here can make that happen, and waiting
      // is the failure this handler exists to end.
      req.onblocked = () => {
        cancelDeadline()
        reject(new OutboxUnavailableError('blocked'))
      }
    })
      .then(async (db) => {
        this.seq = await highestSeq(db)
        return db
      })
      .catch((err) => {
        // Do not cache the failure: a browser that refused the database once
        // would otherwise keep refusing it for the rest of the session even
        // if the cause was transient. The caller turns this into the G-2
        // "not saved on this device" line either way.
        this.db = null
        throw err
      })
    return this.db
  }

  /**
   * The stored tail is the *caught* promise. Chaining onto a rejected one
   * skips its callback, so one failed write — a quota error, an aborted
   * transaction — would mean every later write silently never ran. The
   * caller still learns about its own failure through the returned promise,
   * and the outbox turns that into the G-2 "not saved on this device" line.
   */
  private enqueueWrite<T>(work: () => Promise<T>): Promise<T> {
    const done = this.settled.then(work)
    this.settled = done.then(
      () => undefined,
      () => undefined,
    )
    return done
  }

  append(partition: PartitionKey, mutation: Mutation): Promise<void> {
    return this.enqueueWrite(async () => {
      const db = await this.open()
      const record: PendingRecord = {
        mutation_id: mutation.mutation_id,
        seq: this.seq++,
        partition,
        mutation,
      }
      await runWrite(db, [PENDING], (tx) => {
        tx.objectStore(PENDING).put(record)
      })
    })
  }

  remove(mutationIds: string[]): Promise<void> {
    if (mutationIds.length === 0) return this.settled
    return this.enqueueWrite(async () => {
      const db = await this.open()
      await runWrite(db, [PENDING], (tx) => {
        const store = tx.objectStore(PENDING)
        for (const id of mutationIds) store.delete(id)
      })
    })
  }

  park(partition: PartitionKey, mutation: Mutation, reason: string, at: number): Promise<void> {
    return this.enqueueWrite(async () => {
      const db = await this.open()
      const record: ParkedRecord = {
        mutation_id: mutation.mutation_id,
        seq: this.seq++,
        partition,
        mutation,
        reason,
        at,
      }
      // One transaction over both stores: a parked mutation that stayed in
      // the queue would be pushed again forever, and one removed without
      // being parked would vanish without a trace.
      await runWrite(db, [PENDING, PARKED], (tx) => {
        tx.objectStore(PARKED).put(record)
        tx.objectStore(PENDING).delete(mutation.mutation_id)
      })
    })
  }

  async loadPending(): Promise<PendingMutation[]> {
    const records = await this.readAll<PendingRecord>(PENDING)
    return records.map((r) => ({ partition: r.partition, mutation: r.mutation }))
  }

  async loadParked(): Promise<ParkedMutation[]> {
    const records = await this.readAll<ParkedRecord>(PARKED)
    return records.map((r) => ({
      partition: r.partition,
      mutation: r.mutation,
      reason: r.reason,
      at: r.at,
    }))
  }

  private async readAll<T>(storeName: string): Promise<T[]> {
    const db = await this.open()
    return new Promise<T[]>((resolve, reject) => {
      const req = db
        .transaction(storeName, 'readonly')
        .objectStore(storeName)
        .index(BY_SEQ)
        .getAll()
      req.onsuccess = () => resolve(req.result as T[])
      req.onerror = () => reject(req.error)
    })
  }
}

/** runWrite wraps one readwrite transaction in a promise that settles with it. */
function runWrite(
  db: IDBDatabase,
  stores: string[],
  work: (tx: IDBTransaction) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
    try {
      work(tx)
    } catch (err) {
      // A synchronous throw (a value the browser cannot structured-clone,
      // a quota refusal raised on put) never reaches the transaction's own
      // handlers, so it has to be forwarded here or the promise would hang.
      try {
        tx.abort()
      } catch {
        // Already aborting — the abort handler will settle the promise.
      }
      reject(err)
    }
  })
}

/** highestSeq seeds the append counter so ordering survives a restart. */
async function highestSeq(db: IDBDatabase): Promise<number> {
  const highest = await Promise.all(
    [PENDING, PARKED].map(
      (name) =>
        new Promise<number>((resolve, reject) => {
          const req = db
            .transaction(name, 'readonly')
            .objectStore(name)
            .index(BY_SEQ)
            .openCursor(null, 'prev')
          req.onsuccess = () =>
            resolve(((req.result?.value as PendingRecord | undefined)?.seq ?? -1) + 1)
          req.onerror = () => reject(req.error)
        }),
    ),
  )
  return Math.max(...highest)
}
