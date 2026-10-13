import { computed, reactive, ref } from 'vue'

import { WS_CHANNEL_TRIP_PREFIX, type PullChange, type WSEvent } from '@/api/types'
import type { APIClient, TokenProvider } from '@/sync/apiClient'
import type { HLCGenerator } from '@/sync/hlc'
import type { NowMs } from '@/lib/clock'
import { SyncOutbox, type ConflictReport, type RejectionReport } from '@/sync/outbox'
import { IndexedDBOutboxStore, type OutboxStore } from '@/sync/outboxStore'
import { createWebSocket } from '@/sync/webSocket'
import type { SyncBackend } from './port'
import type { useSyncStatus } from '../useSyncStatus'

export interface ServerBackendDeps {
  client: APIClient
  hlc: HLCGenerator
  baseUrl: string
  getToken: TokenProvider
  syncStatus: ReturnType<typeof useSyncStatus>
  now: NowMs
  /** Routes pulled rows into the stores. */
  apply: (changes: PullChange[]) => void
  onEvent: (event: WSEvent) => void
  /** The socket went up or down; down means whatever it said about others no longer holds. */
  onLive: (live: boolean) => void
  /** The master partition was pulled: what it brought may change what other trips mean. */
  onMasterPulled: () => void
  /** The queue is replayed and the socket is open: surface what arrived while away. */
  onConnected: () => void
  onConflicts?: (report: ConflictReport) => void
  onRejections?: (report: RejectionReport) => void
  /** Defaults to IndexedDB. */
  outboxStore?: OutboxStore
}

/** A `server` client (Single-User Mode included): an outbox, a socket and the REST client. */
export function createServerBackend(deps: ServerBackendDeps): SyncBackend {
  const { client, hlc, syncStatus, now, apply } = deps

  /*
   * Reactive, both of them: since ADR-033 a *screen* reads them — M2's ring
   * asks whether a trip's rows are here — and a plain Set is a value Vue
   * cannot see change. The row loaded correctly and went on saying it was
   * still loading.
   */
  const loadedTripPartitions = reactive(new Set<string>())
  const masterPulled = ref(false)
  // FR-25.15: the outbox's own append; the save indicator reads it with the
  // device-held writer's, which is why it is not `syncStatus.state`.
  const uncaptured = ref(0)

  const outbox = new SyncOutbox(client, hlc, apply, {
    store: deps.outboxStore ?? new IndexedDBOutboxStore(),
    onParked: (entry) => syncStatus.setParked(outbox.parkedCount(), entry.reason),
    onCaptureChanged: (count) => (uncaptured.value = count),
    onConflicts: (report) => {
      syncStatus.addConflicts(report.count)
      deps.onConflicts?.(report)
    },
    onRejections: (report) => deps.onRejections?.(report),
    onDurabilityChanged: (durable) => syncStatus.setQueueDurable(durable),
    now,
  })

  /** Trips this device has asked the hub about — the set every new socket is told. */
  const subscribedTrips = new Set<string>()

  const ws = createWebSocket({
    baseUrl: deps.baseUrl,
    getToken: deps.getToken,
    onEvent: deps.onEvent,
    onLive: (live) => {
      deps.onLive(live)
      syncStatus.setLive(live)
    },
    onOpen: ({ reconnect }) => {
      // The first open is covered by the boot pull App.vue runs; every later
      // one follows a gap the hub cannot replay (P-1), so the gap is pulled.
      if (reconnect) void catchUp()
    },
  })

  /**
   * Pull everything this device is watching. The socket only ever says
   * *that* something changed; after a gap nobody said anything, so the
   * master partition and every subscribed trip are asked directly.
   * Background: this is the app catching up, not the user doing something,
   * and eight trips flickering the glyph through *syncing* would be noise.
   */
  async function catchUp(): Promise<void> {
    await drainMaster()
    for (const tripId of subscribedTrips) {
      await drainTrip(tripId, { background: true })
    }
  }

  /**
   * `background` is a drain nobody asked for — since ADR-033 a list loads the
   * rows it is showing. It leaves the G-2 glyph alone: that glyph answers for
   * what the *user* did, and a row that fails (a trip they were removed from
   * answers 403 while the network is fine) would otherwise announce an outage
   * nobody caused, and eight rows appearing at once would flicker it through
   * *syncing* on every visit to the list.
   */
  async function drainTrip(
    tripId: string,
    { background = false }: { background?: boolean } = {},
  ): Promise<void> {
    if (!background) syncStatus.setSyncing()
    try {
      // A trip row may name a master row written just before it — FR-24.11's
      // composer creates the item and adds it in one act. Pushed alongside
      // the master write, the row reaches a server that does not have its
      // item yet, is refused, and is undone (ADR-031). So a master write that
      // is queued or on the wire goes first, as `drainPartitions` does for a
      // cascade.
      await outbox.whenSent('master', null)
      await outbox.drain('trip', tripId)
      loadedTripPartitions.add(tripId)
      if (!background) {
        syncStatus.setPendingCount(outbox.totalPending())
        syncStatus.setSynced()
      }
      // Report the new cursor so the server recomputes in_sync (§7).
      ws.sendCursor(tripId, outbox.getCursor('trip', tripId))
    } catch {
      if (!background) syncStatus.setOffline()
    }
  }

  async function drainMaster(): Promise<void> {
    syncStatus.setSyncing()
    try {
      await outbox.drain('master', null)
      masterPulled.value = true
      syncStatus.setPendingCount(outbox.totalPending())
      syncStatus.setSynced()
      // FR-27.4: a group edited on another device arrives with this pull, and
      // the trips that follow it work out what it would mean for them here —
      // the device does not have to be on any particular screen.
      deps.onMasterPulled()
    } catch {
      syncStatus.setOffline()
    }
  }

  async function drainAll(tripIds: string[]): Promise<void> {
    syncStatus.setSyncing()
    try {
      await drainMaster()
      for (const id of tripIds) {
        await drainTrip(id)
      }
      syncStatus.setSynced()
    } catch {
      syncStatus.setOffline()
    }
  }

  /**
   * Pushes what a cascade queued: the master partition first, then one trip
   * at a time. The order is the server's foreign keys — a trip's rows are
   * refused until the trips row and the creator's membership exist in the
   * master partition.
   *
   * Fire-and-forget, like the drain in `push`: the write is already on the
   * device and in the queue, and a failed push is the outbox's business, not
   * the caller's.
   */
  function drainPartitions(tripIds: string[]): void {
    syncStatus.setPendingCount(outbox.totalPending())
    drainMaster()
      .then(async () => {
        for (const id of tripIds) await drainTrip(id)
      })
      .catch(() => {})
  }

  return {
    deviceHoldsEverything: false,
    outbox,
    capturePending: computed(() => uncaptured.value > 0),

    async connect() {
      // B2: whatever an earlier session could not send is replayed *before*
      // the first pull, so a server change never overwrites a local one that
      // simply had not left the device yet. Awaited rather than fired off:
      // App.vue's own drainMaster follows this call, and two overlapping
      // drains of the same partition would push the same chunk twice.
      const restored = await outbox.restore()
      syncStatus.setPendingCount(outbox.totalPending())
      syncStatus.setParked(outbox.parkedCount(), outbox.lastParkedReason())
      for (const partition of restored) {
        await (partition.type === 'master' ? drainMaster() : drainTrip(partition.id!))
      }
      ws.connect()
      deps.onConnected()
    },
    /**
     * The app is back in view or back online. Makes sure a socket exists — a
     * frozen tab's backoff never fired, and its socket may be dead without a
     * close — and pulls what was missed meanwhile, without waiting for the
     * socket, since the pull is the recovery and the socket only the notice.
     */
    resume() {
      ws.ensureConnected()
      void catchUp()
    },
    disconnect: () => ws.disconnect(),

    applied() {},
    enqueue(partition, muts) {
      for (const m of muts) outbox.enqueue(partition.type, partition.id, m.mutation)
      syncStatus.setPendingCount(outbox.totalPending())
    },
    push(batches) {
      const trips = batches.flatMap((b) => (b.partition.id === null ? [] : [b.partition.id]))
      if (batches.some((b) => b.partition.type === 'master')) {
        drainPartitions(trips)
        return
      }
      for (const id of trips) drainTrip(id).catch(() => {})
    },
    drainPartitions,

    drainTrip,
    drainMaster,
    drainAll,
    whenSent: (partition) => outbox.whenSent(partition.type, partition.id),

    tripDataLoaded: (tripId) => loadedTripPartitions.has(tripId),
    masterDataLoaded: () => masterPulled.value,

    setViewing: (tripId) => ws.setViewing(tripId),
    subscribeTrip(tripId) {
      subscribedTrips.add(tripId)
      ws.subscribe([`${WS_CHANNEL_TRIP_PREFIX}${tripId}`])
    },
    shareLocation: (tripId, fix) => ws.shareLocation(tripId, fix),
  }
}
