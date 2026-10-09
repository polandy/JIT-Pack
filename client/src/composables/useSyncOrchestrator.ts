/**
 * Sync orchestrator — the central glue between stores, outbox and WebSocket,
 * and the one write facade every view holds.
 *
 * What is left here is the glue itself:
 * 1. Builds APIClient, HLC, SyncOutbox, WebSocket and the mutation factory
 * 2. Routes pull changes to the right store (trip vs master)
 * 3. Routes WebSocket events to whichever piece owns them
 * 4. Owns the write funnel — optimistic paint, queue, drain — that every
 *    action group is bound to through `SyncContext`
 * 5. Manages sync status for the G-2 indicator
 *
 * What is *not* here is anything that decides something. The rules live in
 * `app/actions/`, whose groups are bound to a `SyncContext`, and in the
 * groups beside them in `app/` that need no context at all — locks,
 * notifications, conflicts, identity and images, each taking the two or
 * three plain values it actually uses. The facade builds each one and hands
 * it out whole under its own namespace (`orchestrator.packing.*`, ADR-098).
 */

import { markLocalWrite } from '@/local/exportReminder'
import { deviceId } from '@/mode'
import { computed, reactive, ref } from 'vue'

import { APIClient, type TokenProvider } from '@/sync/apiClient'
import { loadTokens, subjectOf } from '@/auth/tokens'
import { HLCGenerator } from '@/sync/hlc'
import { SyncOutbox, type ConflictReport, type RejectionReport } from '@/sync/outbox'
import { createWriteFunnel, type PartitionBatch, type Write } from '@/sync/writeFunnel'
import { TABLE } from '@/api/tables'
import { storeFor } from '@/sync/routing'
import { applyChangesToSinks, currentRowIn, holdsTable, removeCascading } from '@/sync/sinks'
import type { FeatureStore, ModuleHost } from '@/sync/featureModule'
import { createContainerActions } from '@/app/actions/containers'
import { createCommentActions } from '@/app/actions/comments'
import { createDependencyActions } from '@/app/actions/dependencies'
import { createSeriesActions } from '@/app/actions/series'
import { createMasterDataActions } from '@/app/actions/masterData'
import { createPackingActions } from '@/app/actions/packing'
import { createGroupRefreshActions } from '@/app/actions/groupRefresh'
import { createInventoryNameActions } from '@/app/actions/inventoryNames'
import { createTripLifecycleActions } from '@/app/actions/tripLifecycle'
import { createPostTripActions } from '@/app/actions/postTrip'
import { createExcursionActions } from '@/app/actions/excursions'
import { createTripCreationActions } from '@/app/actions/tripCreation'
import { createClaimActions } from '@/app/actions/claims'
import { createMembershipActions } from '@/app/actions/membership'
import { createPortableActions } from '@/app/actions/portable'
import { createRemovalPruneActions } from '@/app/actions/removalPrune'
// The screens read this module rather than the group, so the type keeps its
// public home even though FR-24.3's rules moved.
export type { DeletionOutlook } from '@/app/actions/masterData'
export type { CloneDraft, TripWizardDraft } from '@/app/actions/tripCreation'
import { createNameGuards } from '@/app/names'
import { createLockState } from '@/app/locks'
import { createNotificationActions } from '@/app/notifications'
import { createConflictActions } from '@/app/conflicts'
import { createActivityActions } from '@/app/activity'
import { createIdentityActions } from '@/app/identity'
import { createIdeaPictures } from '@/app/ideaImages'
import { createExcursionTracks, createIdeaTracks } from '@/app/trackFiles'
import { createLinkPreview } from '@/app/linkPreview'
import { createImageActions } from '@/app/images'
import { knownTripItemsOf } from '@/app/context'
import type { SyncContext } from '@/app/context'
import { createWebSocket, type LocationFrame } from '@/sync/webSocket'
import { applyLocation, type PeopleFixes } from '@/lib/liveLocation'
import { createMutations } from '@/sync/mutations'
import { useSyncStatus } from './useSyncStatus'
import { useIdentityStore } from '@/stores/identityStore'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import type {
  ConflictEntry,
  LockEvent,
  PresenceMember,
  RosterMember,
  LiveLocation,
  PullChange,
  WSEvent,
} from '@/api/types'
import { localIsoDate } from '@/domain/trips'
import { defaultNowMs, isoFrom, type NowMs } from '@/lib/clock'
import type { ServerNotification } from '@/notifications/format'
import type { IndexedDBPersistence } from '@/local/persistence'
import { IndexedDBOutboxStore, type OutboxStore } from '@/sync/outboxStore'

/** One entry of a trip's presence facepile (G-10, Sync-API §7). */
// Both shapes come from the contract now (NFR-4.14). The names are kept as
// aliases because the screens read this module, not the wire: what changed is
// that neither can drift from what the server sends — the conflict entry had
// already lost `mutation_id` and `actor_user_id` that way.
export type PresenceUser = PresenceMember
export type { ConflictEntry, LockEvent }

export interface SyncOrchestratorConfig {
  baseUrl: string
  getToken: TokenProvider
  /**
   * The account this session belongs to, or null where there is none
   * (Local Mode, Single-User Mode). Only claims consult it — see
   * `heldByAnotherAccount`. Defaults to the subject of the stored session
   * token; injected in tests.
   */
  currentUserId?: () => string | null
  /**
   * OIDC only: called when a request 401s despite the provided token —
   * forces a token refresh, and the request is retried once (Sync-API §2).
   */
  onUnauthorized?: () => Promise<string | null>
  /**
   * Local Mode (Addendum 3.19, FR-19.2): when set, mutations persist to
   * this store instead of the sync outbox, and no network or WebSocket
   * is ever touched. The optimistic rows are authoritative.
   */
  local?: IndexedDBPersistence
  /**
   * The device's clock, in milliseconds. One value feeds all three things
   * that ask what time it is — the HLC generator, `today`, and the ISO
   * stamps the mutations write — so they cannot answer differently.
   */
  now?: NowMs
  /**
   * The clock behind FR-27.4's "is this trip past?" question. Injected so a
   * test can stand on either side of a trip's end date without moving the
   * machine's clock; defaults to the local date, not UTC, because the day a
   * trip ends is the day the traveller is living in.
   *
   * Derived from `now` when only that is given; supply it directly to move
   * the calendar day without moving the instant.
   */
  today?: () => string
  /**
   * FR-6.2 in-app channel: invoked for each incoming notification —
   * live ones (notification.created) and unread ones found on connect.
   * The callee surfaces it (toast) and marks it read via
   * markNotificationRead. No-op in Local Mode.
   */
  onNotification?: (n: ServerNotification) => void
  /**
   * Called when a push comes back `merged`, i.e. the server dropped fields
   * of this device's changes (NFR-4.2a). The callee surfaces it; the
   * report names the partition, which is which conflict log to open.
   */
  onConflicts?: (report: ConflictReport) => void
  /**
   * Called when a push came back with refused mutations (Sync-API §5,
   * ADR-031). The change is undone either way — by the row the server
   * re-logged or by the client dropping it — and this is what lets the user
   * be told rather than watch a row change back by itself.
   */
  onRejections?: (report: RejectionReport) => void
  /**
   * Where the outbox keeps its queue between sessions (B2, NFR-4.1).
   * Injected so a test can drive a store it can see; Server Mode defaults
   * to IndexedDB, and Local Mode never builds one — it has no outbox.
   */
  outboxStore?: OutboxStore
  /**
   * Called once per Local Mode write that lands after hydration (FR-19.8's
   * last-write stamp). Injected so a test can count the calls.
   */
  onLocalWrite?: () => void
  /**
   * The `deviceId` half of every HLC stamp. Defaults to this device's stored
   * identity; injected so a test can name the device it is standing on
   * instead of reaching into storage.
   */
  deviceId?: string
  /**
   * The feature modules' stores (FR-30.3, ADR-066), handed in by the
   * composition root so this file never imports a module. Their tables are
   * routed to them on pull, and a deleted trip takes their rows along.
   */
  features?: readonly FeatureStore[]
}

/**
 * The write facade every view holds. Named because it is what the injection
 * key carries (`composables/shared/useOrchestrator.ts`); a consumer asks for the
 * type by name rather than restating how it is derived.
 */
export type Orchestrator = ReturnType<typeof useSyncOrchestrator>

export function useSyncOrchestrator(config: SyncOrchestratorConfig) {
  const tripStore = useTripStore()
  const masterStore = useMasterStore()
  const syncStatus = useSyncStatus(() => now())
  const local = config.local ?? null
  const features = config.features ?? []
  // Deliberately not `config.getToken`: that provider may refresh and is
  // therefore async, and a lock decision is made while rendering a row.
  // The stored session answers the same question synchronously — memoised
  // on the token itself, because M4 asks it three times per row per render
  // and the answer only changes when the session does.
  let cachedSession: { token: string | null; subject: string | null } | null = null
  const currentUserId =
    config.currentUserId ??
    (() => {
      const token = loadTokens()?.access_token ?? null
      if (!cachedSession || cachedSession.token !== token) {
        cachedSession = { token, subject: subjectOf(token) }
      }
      return cachedSession.subject
    })
  const now = config.now ?? defaultNowMs
  const nowIso = isoFrom(now)
  const today = config.today ?? (() => localIsoDate(now()))
  if (local) syncStatus.setLocal()

  // G-10: per-trip presence, fed by the WS presence event.
  const presence = ref<Map<string, PresenceUser[]>>(new Map())

  function getPresence(tripId: string): PresenceUser[] {
    return presence.value.get(tripId) ?? []
  }

  // FR-4.9: who else has a shared trip open in the packing list, fed by the
  // WS roster event. Empty in Local Mode and Single-User Mode, and after a
  // socket dies — the hub sends the whole roster afresh on the next one.
  const roster = ref<RosterMember[]>([])

  function getRoster(): RosterMember[] {
    return roster.value
  }

  // FR-29.19: where the others on a trip are, as their sockets say it —
  // held only here, and forgotten with the socket (ADR-087).
  const liveLocations = ref<Map<string, PeopleFixes>>(new Map())

  function getLiveLocations(tripId: string): PeopleFixes {
    return liveLocations.value.get(tripId) ?? new Map()
  }

  /** Shares this device's position on a trip, `null` to stop. Local Mode has nobody to tell. */
  function shareLocation(tripId: string, fix: LocationFrame | null) {
    if (local) return
    ws.shareLocation(tripId, fix)
  }

  // G-3 locking, and the takeover rule an `item.locked` frame carries
  // (FR-5.3/5.7). All of it in `sync/locks.ts`, which needs no client, no
  // store and no outbox to answer what a row asks while rendering.
  const locks = createLockState(currentUserId)

  const client = new APIClient(config.baseUrl, config.getToken, {
    onUnauthorized: config.onUnauthorized,
    // FR-19.6: the glyph says *offline* for every reason there is, so the
    // sheet behind it names the last request that actually failed.
    onFailure: (failure) => syncStatus.setLastFailure(failure),
    now,
  })

  const hlc = new HLCGenerator(now, config.deviceId ?? deviceId())
  const mutations = createMutations(hlc, nowIso)

  // Local Mode never pushes, so it never queues — building a store there
  // would create a database that nothing ever writes to.
  const outboxStore = local ? null : (config.outboxStore ?? new IndexedDBOutboxStore())
  const onLocalWrite = config.onLocalWrite ?? markLocalWrite

  const outbox = new SyncOutbox(client, hlc, onPullChanges, {
    store: outboxStore ?? undefined,
    onParked: (entry) => syncStatus.setParked(outbox.parkedCount(), entry.reason),
    onCaptureChanged: (uncaptured) => (outboxUncaptured.value = uncaptured),
    onConflicts: (report) => {
      syncStatus.addConflicts(report.count)
      config.onConflicts?.(report)
    },
    onRejections: (report) => config.onRejections?.(report),
    onDurabilityChanged: (durable) => syncStatus.setQueueDurable(durable),
  })

  /** Trips this device has asked the hub about — the set every new socket is told. */
  const subscribedTrips = new Set<string>()

  const ws = createWebSocket({
    baseUrl: config.baseUrl,
    getToken: config.getToken,
    onEvent: onWSEvent,
    onLive: (live) => {
      if (!live) {
        roster.value = []
        // A dead socket hears no more positions, and nothing says the last
        // ones still hold; the next socket is given them afresh.
        liveLocations.value = new Map()
      }
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
    if (local) return
    await drainMaster()
    for (const tripId of subscribedTrips) {
      await drainTrip(tripId, { background: true })
    }
  }

  /**
   * Which trips' rows are actually on this device (FR-27.4). Server Mode
   * pulls a trip's partition only when the trip is opened, and Local Mode
   * hydrates from IndexedDB asynchronously — refreshing a trip before its
   * rows are here would read an empty trip and re-add every position it
   * already has. The refresh needs a *settled* signal, not a hopeful one.
   */
  /*
   * Reactive, both of them: since ADR-033 a *screen* reads them — M2's ring
   * asks whether a trip's rows are here — and a plain Set is a value Vue
   * cannot see change. The row loaded correctly and went on saying it was
   * still loading.
   */
  const loadedTripPartitions = reactive(new Set<string>())
  const localHydrated = ref(false)
  const masterPulled = ref(false)

  /** Whether another save has been queued behind the one just finished. */
  let localWrites = 0
  function localWritesPending(): boolean {
    return localWrites > 0
  }

  // FR-25.15: "captured on this device" — the signal the sheets' save
  // indicator renders. It is deliberately not `syncStatus.state`, whose
  // job is the server: that state answers `offline` before `syncing`, so
  // reading it made an open write offline look settled, which is the one
  // case the requirement exists for. Two writers, one per mode: the
  // Local Mode save below, and the outbox's own append.
  const localUncaptured = ref(0)
  const outboxUncaptured = ref(0)
  const capturePending = computed(() => localUncaptured.value > 0 || outboxUncaptured.value > 0)

  // --- Pull change routing ---

  function onPullChanges(changes: PullChange[]) {
    const tripChanges: PullChange[] = []
    const masterChanges: PullChange[] = []
    const featureChanges = features.map(() => [] as PullChange[])

    for (const c of changes) {
      const owner = storeFor(c.table)
      if (owner === 'trip') {
        tripChanges.push(c)
      } else if (owner === 'master') {
        masterChanges.push(c)
      } else if (owner === 'feature') {
        const feature = features.findIndex((f) => holdsTable(f, c.table))
        if (feature >= 0) featureChanges[feature]!.push(c)
      }
    }

    if (tripChanges.length > 0) tripStore.applyChanges(tripChanges)
    if (masterChanges.length > 0) masterStore.applyChanges(masterChanges)
    features.forEach((feature, i) => {
      if (featureChanges[i]!.length > 0) applyChangesToSinks(feature.sinks, featureChanges[i]!)
    })
    // A trip's tombstone is the only news of its delete another device gets:
    // the trip partition's feed dies with the trip, so no module row of it is
    // ever announced (FR-30.3, the same gap the trip store's own cascade closes).
    for (const c of changes) {
      if (c.table === TABLE.trips && c.deleted) {
        features.forEach((f) => removeCascading(f.sinks, TABLE.trips, c.id))
      }
    }

    // FR-19.2: in Local Mode every applied change is durable — this is
    // the single funnel all mutations and startup loads pass through.
    // The indicator follows the write rather than the tap, so "on this
    // device" means the row is *on* the device: a fire-and-forget save
    // told the user it was safe while the transaction was still open,
    // and a reload in that window lost the row.
    if (local && changes.length > 0) {
      // FR-19.8: the startup load passes through here too, and re-saving what
      // was already on the device is not a change the backup could miss.
      if (localHydrated.value) onLocalWrite()
      localWrites += 1
      localUncaptured.value += 1
      syncStatus.setSyncing()
      local
        .save(changes)
        .finally(() => {
          localWrites -= 1
          localUncaptured.value -= 1
        })
        .then(() => {
          if (!localWritesPending()) syncStatus.setLocal()
        })
        .catch(() => syncStatus.setOffline())
    }
  }

  // --- WebSocket event handling ---

  function onWSEvent(event: WSEvent) {
    switch (event.type) {
      case 'trip.changed': {
        const tripId = event.payload?.['trip_id'] as string | undefined
        if (tripId) {
          drainTrip(tripId)
        }
        break
      }
      case 'master.changed':
        drainMaster()
        break
      case 'presence': {
        const tripId = event.payload?.['trip_id'] as string | undefined
        if (tripId) {
          const users = (event.payload?.['users'] as PresenceUser[] | undefined) ?? []
          const next = new Map(presence.value)
          next.set(tripId, users)
          presence.value = next
        }
        break
      }
      case 'roster':
        roster.value = (event.payload?.['users'] as RosterMember[] | undefined) ?? []
        break
      case 'location': {
        const frame = event.payload as LiveLocation | null
        if (!frame?.trip_id || !frame.user_id) break
        const next = new Map(liveLocations.value)
        next.set(frame.trip_id, applyLocation(getLiveLocations(frame.trip_id), frame, now()))
        liveLocations.value = next
        break
      }
      case 'item.locked': {
        const tripId = event.payload?.['trip_id'] as string | undefined
        const itemId = event.payload?.['item_id'] as string | undefined
        const byUser = (event.payload?.['by_user'] as string) ?? ''
        if (!tripId || !itemId) break
        locks.onLocked(tripId, itemId, byUser)
        break
      }
      case 'item.unlocked': {
        const tripId = event.payload?.['trip_id'] as string | undefined
        const itemId = event.payload?.['item_id'] as string | undefined
        if (tripId && itemId) {
          locks.onUnlocked(tripId, itemId)
        }
        break
      }
      case 'notification.created':
        // Thin ping (§7): the row itself comes via GET /notifications.
        void notificationActions.surfaceUnread()
        break
    }
  }

  const notificationActions = createNotificationActions({
    client,
    localMode: !!local,
    onNotification: config.onNotification,
  })

  // --- Drain operations ---

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
    if (local) return
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
    if (local) return
    syncStatus.setSyncing()
    try {
      await outbox.drain('master', null)
      masterPulled.value = true
      syncStatus.setPendingCount(outbox.totalPending())
      syncStatus.setSynced()
      // FR-27.4: a group edited on another device arrives with this pull, and
      // the trips that follow it work out what it would mean for them here —
      // the device does not have to be on any particular screen. Local Mode
      // returns above, and App.vue sweeps once after its hydration instead.
      groupRefreshActions.proposeRefreshForLoadedTrips()
    } catch {
      syncStatus.setOffline()
    }
  }

  async function drainAll(tripIds: string[]): Promise<void> {
    if (local) return
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

  // --- High-level actions (optimistic + queue) ---

  /**
   * The write funnel (`sync/writeFunnel.ts`): it paints what the mutations
   * will do and queues each on its table's feed, and it is the *whole* of a
   * write apart from pushing it. A cascade that writes across both
   * partitions queues every row and drains once at the end
   * (`drainPartitions`); everything else writes and pushes at once (`write`).
   * Neither is allowed to spell the steps out again — the paint carries
   * ADR-016's trap (a change that reaches no store shows nothing) and the
   * queue carries the partition, and a second copy of them drifts.
   */
  const funnel = createWriteFunnel({
    currentRow: (table, id) => {
      const owner = storeFor(table)
      if (owner === 'trip') return tripStore.currentRow(table, id)
      if (owner === 'master') return masterStore.currentRow(table, id)
      const feature = features.find((f) => holdsTable(f, table))
      return feature && currentRowIn(feature.sinks, table, id)
    },
    paint: onPullChanges,
    queue: ({ partition, muts }) => {
      if (local) return
      for (const m of muts) outbox.enqueue(partition.type, partition.id, m.mutation)
    },
  })

  function queue(...writes: Write[]): PartitionBatch[] {
    const batches = funnel.queueWrites(...writes)
    if (!local) syncStatus.setPendingCount(outbox.totalPending())
    return batches
  }

  /**
   * drainPartitions pushes what a cascade queued: the master partition
   * first, then one trip at a time. The order is the server's foreign keys —
   * a trip's rows are refused until the trips row and the creator's
   * membership exist in the master partition.
   *
   * Fire-and-forget, like the drain in `write`: the write is already on the
   * device and in the queue, and a failed push is the outbox's business, not
   * the caller's.
   */
  function drainPartitions(tripIds: string[]): void {
    if (local) return
    syncStatus.setPendingCount(outbox.totalPending())
    drainMaster()
      .then(async () => {
        for (const id of tripIds) await drainTrip(id)
      })
      .catch(() => {})
  }

  function write(...writes: Write[]): void {
    const batches = queue(...writes)
    if (local) return
    const trips = batches.flatMap((b) => (b.partition.id === null ? [] : [b.partition.id]))
    if (batches.some((b) => b.partition.type === 'master')) {
      drainPartitions(trips)
      return
    }
    for (const id of trips) drainTrip(id).catch(() => {})
  }

  /** The spine the extracted action groups are bound to (R-4). */
  const names = createNameGuards(masterStore)
  const ctx: SyncContext = {
    tripStore,
    masterStore,
    features,
    mutations,
    write,
    names,
    local,
    today,
    nowIso,
    tripDataLoaded,
    queue,
    drainPartitions,
    knownTripItems: () => knownTripItemsOf(tripStore),
  }
  const containerActions = createContainerActions(ctx)
  const commentActions = createCommentActions(ctx)
  const dependencyActions = createDependencyActions(ctx)
  const seriesActions = createSeriesActions(ctx)
  const masterDataActions = createMasterDataActions(ctx)
  const packingActions = createPackingActions(ctx)
  const groupRefreshActions = createGroupRefreshActions(ctx, { comments: commentActions })
  const inventoryNameActions = createInventoryNameActions(ctx, {
    groupRefresh: groupRefreshActions,
  })
  const postTripActions = createPostTripActions(ctx, { masterData: masterDataActions })
  // What a picture's or a track's file needs to reach the server, or this
  // device's own store in Local Mode.
  const fileDeps = {
    client,
    local,
    applyChanges: onPullChanges,
    drainTrip: (tripId: string) => drainTrip(tripId),
    // In drainTrip's order: a new trip reaches the server through the
    // master partition, and its rows are refused until it has.
    whenSent: async (tripId: string) => {
      await outbox.whenSent('master', null)
      await outbox.whenSent('trip', tripId)
    },
  }
  const excursionActions = createExcursionActions(ctx, {
    groups: masterDataActions,
    tracks: createExcursionTracks(fileDeps),
  })
  const tripCreationActions = createTripCreationActions(ctx)
  const tripLifecycleActions = createTripLifecycleActions(ctx, {
    comments: commentActions,
    packing: packingActions,
    groupRefresh: groupRefreshActions,
  })
  const claimActions = createClaimActions(ctx, {
    locks,
    client,
    drainTrip: (tripId) => drainTrip(tripId),
  })
  const membershipActions = createMembershipActions(ctx)
  const portableActions = createPortableActions(ctx)
  const removalPruneActions = createRemovalPruneActions(ctx, {
    itemStillUsed: packingActions.itemStillUsed,
    deleteMasterItem: masterDataActions.deleteMasterItem,
    client,
    whenTripSent: (tripId) => outbox.whenSent('trip', tripId),
    drainMaster,
  })

  /**
   * tripDataLoaded answers whether this trip's rows are on the device. It is
   * the guard that keeps the refresh from mistaking "not pulled yet" for
   * "empty trip" — the one way this feature could duplicate the whole list
   * it exists to keep right.
   */
  function tripDataLoaded(tripId: string): boolean {
    return local ? localHydrated.value : loadedTripPartitions.has(tripId)
  }

  /**
   * masterDataLoaded answers the same question for the master partition: are
   * the trips, groups and inventory this device is entitled to actually here?
   *
   * FR-2.8 is the first caller and the reason it exists: M2 picks its opening
   * segment from what the trip list holds, and a list that has not arrived yet
   * is not an empty one — deciding on it would send every cold start to the
   * archive. Same doctrine as the ring above (ADR-033), one partition up.
   */
  function masterDataLoaded(): boolean {
    return local ? localHydrated.value : masterPulled.value
  }

  /** One in-flight `ensureTripData` per trip, so callers share a request. */
  const tripDataRequests = new Map<string, Promise<void>>()

  /**
   * ensureTripData fetches a trip's own rows for a caller that needs them
   * without opening the trip — M2's progress ring is the first (ADR-033).
   *
   * Callers are deduplicated because the caller is a *list*: eight rows
   * scrolling into view together is the ordinary case, and eight identical
   * requests would be the cost this was supposed to avoid. A failed attempt
   * drops out of the map rather than being remembered, or one lost packet
   * would leave the row blank until the app restarts.
   */
  function ensureTripData(tripId: string): Promise<void> {
    if (tripDataLoaded(tripId)) return Promise.resolve()
    const existing = tripDataRequests.get(tripId)
    if (existing) return existing
    const request = drainTrip(tripId, { background: true }).finally(() =>
      tripDataRequests.delete(tripId),
    )
    tripDataRequests.set(tripId, request)
    return request
  }

  const imageActions = createImageActions({
    client,
    local,
    baseUrl: config.baseUrl,
    applyChanges: onPullChanges,
    drainMaster,
  })

  const conflictActions = createConflictActions({
    client,
    localMode: !!local,
    drainTrip: (tripId) => drainTrip(tripId),
    drainMaster,
  })

  const activityActions = createActivityActions({ client, localMode: !!local })

  const identityActions = createIdentityActions({
    client,
    localMode: !!local,
    // Read here rather than held: the pinia store does not exist until a
    // pinia is active, and the orchestrator is built before one is in a test.
    identityCache: () => useIdentityStore(),
  })

  // --- Lifecycle ---

  async function connect(): Promise<void> {
    if (local) {
      // FR-19.2: startup load goes through the same applyChanges path
      // as a server pull; NFR-4.11: ask for storage durability.
      onPullChanges(await local.load())
      localHydrated.value = true
      void local.requestDurability()
      return
    }
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
    // FR-6.2: notifications that arrived while this device was away.
    void notificationActions.surfaceUnread()
  }

  /** FR-4.9: the trip whose packing list is open on this device, `null` once it is not. */
  function setViewing(tripId: string | null) {
    if (local) return
    ws.setViewing(tripId)
  }

  function subscribeTrip(tripId: string) {
    if (local) return
    subscribedTrips.add(tripId)
    ws.subscribe([`trip:${tripId}`])
  }

  /**
   * The app is back in view or back online. Makes sure a socket exists — a
   * frozen tab's backoff never fired, and its socket may be dead without a
   * close — and pulls what was missed meanwhile, without waiting for the
   * socket, since the pull is the recovery and the socket only the notice.
   */
  function resume() {
    if (local) return
    ws.ensureConnected()
    void catchUp()
  }

  function disconnect() {
    if (local) return
    ws.disconnect()
  }

  /**
   * A feature module's write path (FR-30.3): its own rows into a trip's
   * partition, through the same outbox and clock as every other write.
   */
  const moduleHost: ModuleHost = {
    mutation: mutations.make,
    nowIso,
    write,
    pictures: createIdeaPictures(fileDeps),
    tracks: createIdeaTracks(fileDeps),
    linkPreview: createLinkPreview({ client, localMode: !!local }),
  }

  return {
    moduleHost,
    syncStatus,
    capturePending,
    outbox,
    // The FR-27.4 clock, exposed so a view asking "which trips does this
    // reach?" answers with the same date the refresh itself uses — two
    // clocks would let the warning and the behaviour disagree by a day.
    today,
    // The instant behind it, for a screen that shows a time or counts days:
    // a screen reading the real clock past this seam is what a test cannot
    // set and what put FR-5.1 on the UTC day (`clockSeam.spec.ts`).
    now,

    // Lifecycle and drains — the glue this file owns
    connect,
    subscribeTrip,
    resume,
    disconnect,
    drainTrip,
    drainMaster,
    drainAll,
    tripDataLoaded,
    masterDataLoaded,
    ensureTripData,

    // G-10 presence, FR-4.9's roster and FR-29.19's live locations, fed by the socket
    presence: { getPresence, getRoster, setViewing, getLiveLocations, shareLocation },

    // One namespace per action group, named after its file (ADR-098)
    packing: packingActions,
    claims: claimActions,
    removal: removalPruneActions,
    containers: containerActions,
    comments: commentActions,
    dependencies: dependencyActions,
    excursions: excursionActions,
    tripCreation: tripCreationActions,
    tripLifecycle: tripLifecycleActions,
    postTrip: postTripActions,
    groupRefresh: groupRefreshActions,
    inventoryNames: inventoryNameActions,
    portable: portableActions,
    membership: membershipActions,
    masterData: masterDataActions,
    series: seriesActions,
    names,
    images: imageActions,
    conflicts: conflictActions,
    activity: activityActions,
    identity: identityActions,
    notifications: notificationActions,
  }
}
