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
import { ref } from 'vue'

import { APIClient, type TokenProvider } from '@/sync/apiClient'
import { loadTokens, subjectOf } from '@/auth/tokens'
import { HLCGenerator } from '@/sync/hlc'
import type { ConflictReport, RejectionReport } from '@/sync/outbox'
import { MASTER_PARTITION, tripPartition } from '@/sync/partition'
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
import { createNotificationActions, NO_NOTIFICATION_ACTIONS } from '@/app/notifications'
import { createConflictActions, NO_CONFLICT_ACTIONS } from '@/app/conflicts'
import { createActivityActions, NO_ACTIVITY_ACTIONS } from '@/app/activity'
import { createIdentityActions, NO_IDENTITY_ACTIONS } from '@/app/identity'
import { createIdeaPictures } from '@/app/ideaImages'
import { createExcursionTracks, createIdeaTracks } from '@/app/trackFiles'
import { createLinkPreview, NO_LINK_PREVIEW } from '@/app/linkPreview'
import { createImageActions } from '@/app/images'
import { knownTripItemsOf } from '@/app/context'
import type { SyncContext } from '@/app/context'
import type { LocationFrame } from '@/sync/webSocket'
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
  PullChange,
  WSEvent,
} from '@/api/types'
import { routeWSEvent } from '@/sync/wsRouting'
import { localIsoDate } from '@/domain/trips'
import { isoFrom, type NowMs } from '@/lib/clock'
import type { ServerNotification } from '@/notifications/format'
import type { IndexedDBPersistence } from '@/local/persistence'
import type { OutboxStore } from '@/sync/outboxStore'
import type { SyncBackend } from './backend/port'
import { createLocalBackend } from './backend/local'
import { createServerBackend } from './backend/server'

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
   * The clock, in milliseconds — the device's in the app, a fixed one in a
   * spec. One value feeds the HLC generator, `today` and the ISO stamps the
   * mutations write, so they cannot answer differently.
   */
  now: NowMs
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
  const now = config.now
  const nowIso = isoFrom(now)
  const today = config.today ?? (() => localIsoDate(now()))

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
    backend.shareLocation(tripId, fix)
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

  const onLocalWrite = config.onLocalWrite ?? markLocalWrite

  // The one place the mode is asked about the write path (ARCH-14b): every
  // drain, queue, socket and save below goes through the port.
  const backend: SyncBackend = local
    ? createLocalBackend({
        persistence: local,
        syncStatus,
        apply: onPullChanges,
        onLocalWrite,
      })
    : createServerBackend({
        client,
        hlc,
        baseUrl: config.baseUrl,
        getToken: config.getToken,
        syncStatus,
        now,
        apply: onPullChanges,
        onEvent: onWSEvent,
        onLive: (live) => {
          if (live) return
          roster.value = []
          // A dead socket hears no more positions, and nothing says the last
          // ones still hold; the next socket is given them afresh.
          liveLocations.value = new Map()
        },
        onMasterPulled: () => groupRefreshActions.proposeRefreshForLoadedTrips(),
        // FR-6.2: notifications that arrived while this device was away.
        onConnected: () => void remote.notifications.surfaceUnread(),
        onConflicts: config.onConflicts,
        onRejections: config.onRejections,
        outboxStore: config.outboxStore,
      })
  const { outbox, capturePending } = backend

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

    // FR-19.2: in Local Mode every applied change is durable — this is the
    // single funnel all mutations and startup loads pass through.
    backend.applied(changes)
  }

  // --- WebSocket event handling ---

  function onWSEvent(event: WSEvent) {
    routeWSEvent(event, {
      drainTrip: (tripId) => void drainTrip(tripId),
      drainMaster: () => void drainMaster(),
      setPresence: (tripId, users) => {
        const next = new Map(presence.value)
        next.set(tripId, users)
        presence.value = next
      },
      setRoster: (users) => (roster.value = users),
      applyLocation: (frame) => {
        const next = new Map(liveLocations.value)
        next.set(frame.trip_id, applyLocation(getLiveLocations(frame.trip_id), frame, now()))
        liveLocations.value = next
      },
      lockItem: (tripId, itemId, byUser) => locks.onLocked(tripId, itemId, byUser),
      unlockItem: (tripId, itemId) => locks.onUnlocked(tripId, itemId),
      surfaceNotifications: () => void notificationActions.surfaceUnread(),
    })
  }

  // --- Drain operations ---

  const { drainTrip, drainMaster, drainAll, drainPartitions } = backend

  /**
   * The groups that only talk to a server: Local Mode has no one to ask, so
   * it gets their null objects (ARCH-14), chosen here once.
   */
  const remote = local
    ? {
        notifications: NO_NOTIFICATION_ACTIONS,
        conflicts: NO_CONFLICT_ACTIONS,
        activity: NO_ACTIVITY_ACTIONS,
        identity: NO_IDENTITY_ACTIONS,
        linkPreview: NO_LINK_PREVIEW,
      }
    : {
        notifications: createNotificationActions({
          client,
          onNotification: config.onNotification,
        }),
        conflicts: createConflictActions({
          client,
          drainTrip: (tripId) => drainTrip(tripId),
          drainMaster,
        }),
        activity: createActivityActions({ client }),
        identity: createIdentityActions({
          client,
          // Read here rather than held: the pinia store does not exist until a
          // pinia is active, and the orchestrator is built before one is in a test.
          identityCache: () => useIdentityStore(),
        }),
        linkPreview: createLinkPreview({ client }),
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
    queue: ({ partition, muts }) => backend.enqueue(partition, muts),
  })

  function queue(...writes: Write[]): PartitionBatch[] {
    return funnel.queueWrites(...writes)
  }

  function write(...writes: Write[]): void {
    backend.push(queue(...writes))
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
    deviceHoldsEverything: backend.deviceHoldsEverything,
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
      await backend.whenSent(MASTER_PARTITION)
      await backend.whenSent(tripPartition(tripId))
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
    whenTripSent: (tripId) => backend.whenSent(tripPartition(tripId)),
    drainMaster,
  })

  /**
   * tripDataLoaded answers whether this trip's rows are on the device. It is
   * the guard that keeps the refresh from mistaking "not pulled yet" for
   * "empty trip" — the one way this feature could duplicate the whole list
   * it exists to keep right.
   */
  function tripDataLoaded(tripId: string): boolean {
    return backend.tripDataLoaded(tripId)
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
    return backend.masterDataLoaded()
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

  const {
    conflicts: conflictActions,
    activity: activityActions,
    identity: identityActions,
  } = remote
  const notificationActions = remote.notifications

  // --- Lifecycle ---

  const { connect, resume, disconnect, setViewing, subscribeTrip } = backend

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
    linkPreview: remote.linkPreview,
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
    removalPrune: removalPruneActions,
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
