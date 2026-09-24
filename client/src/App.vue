<script setup lang="ts">
/**
 * Root app component — provides AppHeader (G-9) and responsive layout.
 * Desktop (≥900px): left nav rail + content area.
 * Mobile (<900px): content area + the bottom tab bar, which is a sibling
 * of the outlet rather than an IonTabs layout around it (ADR-012).
 *
 * First launch shows M19 (FR-19.1) until a mode is chosen; afterwards
 * the persisted mode decides whether the orchestrator runs against a
 * server or against IndexedDB (Local Mode, Addendum 3.19).
 */
import { API } from '@/api/routes'
import type { InstanceConfigResponse } from '@/api/types'
import { setCurrency } from '@/lib/currency'
import { IonApp, IonRouterOutlet, toastController } from '@ionic/vue'
import AppHeader from '@/components/global/AppHeader.vue'
import PageHead from '@/components/global/PageHead.vue'
import TripViewNav from '@/components/trips/TripViewNav.vue'
import NavRail from '@/components/global/NavRail.vue'
import TabBar from '@/components/global/TabBar.vue'
import MigrationBanner from '@/components/global/MigrationBanner.vue'
import UpdateBanner from '@/components/global/UpdateBanner.vue'
import { PANEL_HOST_ID } from '@/lib/frameSlots'
import ModeSelectionPage from '@/views/ModeSelectionPage.vue'
import { createAuthRefresher } from '@/auth/refresh'
import { clearOnSessionEnd } from '@/auth/sessionEnd'
import { useIdentityStore } from '@/stores/identityStore'
import { onlineRows } from '@/lib/onlineRows'
import { loadTokens } from '@/auth/tokens'
import {
  describeNotification,
  notificationRoute,
  type ServerNotification,
} from '@/notifications/format'
import { startNotificationMirror } from '@/notifications/mirror'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import type { ConflictReport, RejectionReport } from '@/composables/useSyncOutbox'
import { serverBaseUrl } from '@/config'
import { IndexedDBPersistence } from '@/local/persistence'
import SheetModal from '@/components/global/SheetModal.vue'
import SyncDetailSheet from '@/components/global/SyncDetailSheet.vue'
import { useDeviceBackup } from '@/composables/useDeviceBackup'
import { lastExportAt } from '@/local/exportReminder'
import { readStorageStatus, type StorageStatus } from '@/local/storageStatus'
import { applyUpdate, swUpdateApplying, swUpdateDismissed, swUpdateReady } from '@/pwa/register'
import {
  chooseMode as persistMode,
  clearMigrationPending,
  loadMigrationPending,
  migrationPending,
  readMode,
  type ClientMode,
} from '@/mode'
import { t } from '@/i18n'
import { rejectionToastMessage } from '@/sync/rejectionReasons'
import { provide, computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PATH, tripPath, tripSubPath } from '@/router/paths'
import { confirmAction } from '@/lib/confirm'
import { resolveHead } from '@/composables/useHeaderTitle'
import { createPackingShoppingSource } from '@/composables/packingShoppingSource'
import { SHOPPING_SOURCES } from '@/lib/shoppingSources'
import { TRIP_VIEW_COUNTS } from '@/lib/tripViews'
import { TRIP_CARDS } from '@/lib/tripCards'
import { useTripStore } from '@/stores/tripStore'
import { ShoppingDashboardCard, shoppingCount, shoppingFeatureStore } from '@/shopping'

const mode = ref(readMode())
// FR-19.8: only the switch off Local Mode sets this, so only a server client
// can have it to read.
if (mode.value === 'server') loadMigrationPending()

/** Step 3 of the move: M18's restore branch, reached from the bar. */
function restoreMigration() {
  router.push(PATH.importFile)
}

/** A fresh start is a legitimate outcome — confirmed once, then the bar is gone for good. */
async function skipMigration() {
  const confirmed = await confirmAction({
    header: t('migration.skipConfirm.title'),
    message: t('migration.skipConfirm.body'),
    confirmLabel: t('migration.skipConfirm.confirm'),
  })
  if (!confirmed) return
  clearMigrationPending()
}

function chooseMode(selected: ClientMode, serverUrl: string | null) {
  persistMode(selected, serverUrl)
  mode.value = selected
  // Clean re-init: the orchestrator is constructed once per app start.
  window.location.reload()
}

// OIDC token lifecycle (Sync-API §2): the refresher renews the access
// token shortly before expiry and after a 401; without stored tokens
// (Single-User servers, Local Mode) it stays inert and hands out null.
const refresher = mode.value === 'server' ? createAuthRefresher(serverBaseUrl()) : null

const orchestrator = mode.value
  ? useSyncOrchestrator({
      baseUrl: serverBaseUrl(),
      getToken: refresher ? () => refresher.freshToken() : () => loadTokens()?.access_token ?? null,
      onUnauthorized: refresher ? () => refresher.refresh() : undefined,
      local: mode.value === 'local' ? new IndexedDBPersistence() : undefined,
      onNotification: showNotificationToast,
      onConflicts: showConflictToast,
      onRejections: showRejectionToast,
      // FR-30.3 (ADR-066): the modules' stores, so the orchestrator routes
      // their rows without importing a module.
      features: [shoppingFeatureStore()],
    })
  : null

/**
 * NFR-4.2a: a push that came back `merged` dropped fields of this device's
 * changes. One toast per *push*, never per conflict — a reconnect drains a
 * whole queue and would otherwise stack a wall of them — and it leads to
 * the log for the partition it happened on, which is where the detail is.
 */
async function showConflictToast(report: ConflictReport) {
  const toast = await toastController.create({
    message: t('sync.conflictToast', { n: report.count }),
    duration: 6000,
    position: 'top',
    buttons: [
      {
        text: t('sync.conflictToastOpen'),
        handler: () => {
          // `id` is null exactly on the master partition; the builder is
          // what made that visible, where the template literal used to
          // push `/trips/null/conflicts` and open an empty trip log.
          router.push(
            report.type === 'trip' && report.id
              ? tripSubPath(report.id, 'conflicts')
              : PATH.masterConflicts,
          )
        },
      },
    ],
  })
  await toast.present()
}

/**
 * Sync-API §5 / ADR-031: a refused mutation is undone — by the row the
 * server re-logged, or by the client dropping one the server could not send
 * back. Either way the row changes back under the user's hands, and this is
 * the moment it is said out loud; G-2's sheet keeps the standing record.
 * One toast per push, like the conflict one beside it.
 */
async function showRejectionToast(report: RejectionReport) {
  const toast = await toastController.create({
    message: rejectionToastMessage(report.count, report.reason),
    duration: 6000,
    position: 'top',
  })
  await toast.present()
}

// FR-6.2 in-app channel: each notification is a toast; tapping Open
// deep-links into the item context (FR-6.3/G-4). Read is stamped on
// dismissal — there is no inbox screen, the toast is the delivery.
async function showNotificationToast(n: ServerNotification) {
  const route = notificationRoute(n)
  const toast = await toastController.create({
    message: describeNotification(n),
    duration: 6000,
    position: 'top',
    buttons: route
      ? [
          {
            text: 'Open',
            handler: () => {
              router.push(route)
            },
          },
        ]
      : [{ text: 'OK', role: 'cancel' }],
  })
  toast.onDidDismiss().then(() => orchestrator?.markNotificationRead(n.id))
  await toast.present()
}

provide(ORCHESTRATOR, orchestrator)

/*
 * FR-30.2/30.3 (ADR-066): the composition root is the one place that knows
 * both the packing list and the shopping module. It binds the packing list's
 * buy-mode rows into the shopping list as a source, and hands the switcher
 * the module's count — so neither side imports the other.
 */
const shoppingSources = orchestrator
  ? [createPackingShoppingSource(useTripStore(), orchestrator)]
  : []
provide(SHOPPING_SOURCES, shoppingSources)
provide(TRIP_VIEW_COUNTS, { shopping: shoppingCount(shoppingSources) })
// FR-30.7: the shopping list, workable on the dashboard under each trip.
provide(TRIP_CARDS, orchestrator ? [ShoppingDashboardCard] : [])

const syncStatus = orchestrator?.syncStatus ?? null

// NFR-4.12: leave the notification vocabulary where the service worker can
// read it — it can reach neither `localStorage` nor the catalogue (ADR-037).
startNotificationMirror()

onMounted(async () => {
  // Server Mode without a session: if the server offers OIDC, log in
  // first (Single-User/HS256 servers answer 501 → proceed without).
  if (mode.value === 'server' && !loadTokens() && !window.location.pathname.startsWith('/auth/')) {
    try {
      const resp = await fetch(`${serverBaseUrl()}${API.authConfig}`)
      if (resp.ok) {
        router.replace('/login')
      }
    } catch {
      // Server unreachable — the sync indicator will show offline.
    }
  }
  // FR-21.9: what the instance labels its amounts with. Unauthenticated and
  // outside the OIDC branch above, because Single-User Mode has a currency
  // and no session — and a failure here is silent by design: the persisted
  // code from the last start is already applied, and losing every label
  // because a request timed out is worse than a stale three-letter code.
  if (mode.value === 'server') {
    try {
      const resp = await fetch(`${serverBaseUrl()}${API.instanceConfig}`)
      if (resp.ok) {
        const config: InstanceConfigResponse = await resp.json()
        setCurrency(config.currency)
      }
    } catch {
      // Server unreachable — keep the last known label.
    }
  }

  // Sync-API P-1: the app coming back — a tab unfrozen, the network back, a
  // page restored from the back-forward cache — is when a socket is most
  // likely to be dead without having said so, and when a frozen backoff
  // timer would otherwise keep the device deaf for another half minute.
  for (const type of RESUME_EVENTS) window.addEventListener(type, onResume)
  // Awaited: in Local Mode this *is* the hydration from IndexedDB, and the
  // FR-27.4 sweep below must not run against a device whose rows have not
  // arrived yet.
  await orchestrator?.connect()
  // Initial pull of master data (no-op in Local Mode)
  await orchestrator?.drainMaster()
  // FR-27.4: a group edited on another device arrives with that pull. The
  // trips that follow it work out what it would mean for them here, so M2
  // can say which ones have a question waiting — nothing is applied.
  orchestrator?.proposeRefreshForLoadedTrips()
})

onUnmounted(() => {
  stopSessionEnd()
  for (const type of RESUME_EVENTS) window.removeEventListener(type, onResume)
  orchestrator?.disconnect()
})

/** The three ways a browser says "the app is back" — see `resume()`. */
const RESUME_EVENTS = ['visibilitychange', 'online', 'pageshow'] as const

function onResume(ev: Event) {
  // `visibilitychange` fires on the way out too; only coming back matters.
  if (ev.type === 'visibilitychange' && document.visibilityState !== 'visible') return
  // `pageshow` also fires on every ordinary load, where the boot pull is
  // already running; only a back-forward-cache restore is a return.
  if (ev.type === 'pageshow' && !(ev as PageTransitionEvent).persisted) return
  orchestrator?.resume()
}

// G-2: tapping the sync indicator opens the detail behind it (FR-19.6).
// It used to navigate straight to a trip's conflict log and do nothing at
// all anywhere else, which left the glyph unexplained on every other screen
// and Local Mode without the storage detail NFR-4.11 requires.
const route = useRoute()
const router = useRouter()

/** G-9's page head: what the frame renders above the outlet, if anything. */
const pageHead = computed(() => resolveHead(route.path, route.meta.titleKey))

/**
 * FR-21.21: a trip's screen offers the trip's other screens, from the route
 * table rather than from each view — the same reason the content column is
 * capped by the frame and not by the views.
 */
const tripView = computed(() => route.meta.tripView)
const tripViewId = computed(() => {
  const id = route.params.tripId
  return typeof id === 'string' ? id : null
})

// A session that ends — the IdP refusing the refresh, or the account
// deactivated (FR-23.3) — returns to the login. Attached here, in setup,
// because a child's `onMounted` makes the request that can end it before
// this component's own `onMounted` gets past its awaits (see `onSessionEnded`).
const identity = useIdentityStore()
const stopSessionEnd = clearOnSessionEnd({
  forget: () => identity.forget(),
  toLogin: () => router.replace('/login'),
})

const tripStore = useTripStore()

/**
 * FR-4.9: who else is packing, for the G-2 sheet. `null` where the session has
 * no accounts to name — Local Mode, and Single-User Mode, whose one implicit
 * user has nobody to share a trip with (G-8).
 */
const online = computed(() =>
  mode.value === 'server' && identity.myUserId !== null && orchestrator
    ? onlineRows(orchestrator.getRoster(), identity.directory, tripStore.getTrip)
    : null,
)

const syncDetailOpen = ref(false)
const storage = ref<StorageStatus | null>(null)
const lastExport = ref<number | null>(null)
const detailNow = ref(0)

const tripId = computed(() => {
  const id = route.params['tripId']
  return typeof id === 'string' && id ? id : null
})

async function onSyncTap() {
  // Read the facts when the sheet opens, not on a timer: they change rarely
  // and a stale storage figure is worse than a fresh one nobody looked at.
  //
  // Before it opens, not after: an auto-height sheet is measured once at
  // presentation, so a storage section that arrived a tick later grew the
  // content past the box Ionic had already sized — the last line rendered
  // under the tab bar. Found on a rendered pixel, invisible in the markup.
  detailNow.value = Date.now()
  // The names in the roster come from the directory; a device that has not
  // opened a screen needing it yet has none.
  if (orchestrator && mode.value === 'server') void identity.load(orchestrator)
  lastExport.value = lastExportAt()
  storage.value = mode.value === 'local' ? await readStorageStatus() : null
  syncDetailOpen.value = true
}

function openConflicts() {
  const id = tripId.value
  syncDetailOpen.value = false
  if (id) router.push(tripSubPath(id, 'conflicts'))
}

function openOnlineTrip(id: string) {
  syncDetailOpen.value = false
  router.push(tripPath(id))
}

function openMasterConflicts() {
  syncDetailOpen.value = false
  router.push(PATH.masterConflicts)
}

const { hasBackupContent, saveBackup: writeDeviceBackup } = useDeviceBackup()

/** FR-19.6's one-tap backup from the G-2 sheet; the file is the composable's. */
async function saveBackup() {
  const now = await writeDeviceBackup()
  lastExport.value = now
  // The sheet's clock advances with the write it is describing.
  detailNow.value = now
}
</script>

<template>
  <IonApp>
    <!-- M19: one-time mode selection before anything else exists -->
    <ModeSelectionPage v-if="!mode" @select="chooseMode" />

    <template v-else-if="syncStatus">
      <AppHeader
        :sync-state="syncStatus.state.value"
        :sync-pending-count="syncStatus.pendingCount.value"
        :sync-label="syncStatus.label.value"
        :sync-update-ready="swUpdateReady"
        @sync-tap="onSyncTap"
      />
      <!-- FR-19.8: step three of the move, until the restore commits or is
           declined. In the column, not over it: `switchToServer` reloads, and
           the flag is read at boot, so this bar is either there from the first
           paint or never — it cannot appear under a finger. A banner added
           here that can flip *during* a page load belongs in the layer above. -->
      <MigrationBanner
        v-if="mode === 'server' && migrationPending"
        @restore="restoreMigration"
        @skip="skipMigration"
      />
      <div class="app-body">
        <NavRail />
        <main class="app-content">
          <!-- G-9: the screen's name, once, for every screen that registers
               one — including the tab roots, which used to write their own
               (ADR-050). -->
          <PageHead
            v-if="pageHead"
            :title="pageHead.title"
            :meta="pageHead.meta"
            :collapsed="pageHead.collapsed"
          >
            <TripViewNav v-if="tripView && tripViewId" :trip-id="tripViewId" :current="tripView" />
          </PageHead>
          <!--
            FR-19.7: the one-press offer, under the bar rather than inside the
            G-2 sheet, because the sheet's offer costs knowing what the dot
            means. It is the app's one banner that can arrive while somebody is
            using the screen, so it overlays rather than reflows, and it sits
            after the head so it never covers the screen's own name (ADR-060
            and its amendment 1, G-19).
          -->
          <div class="app-banner-layer">
            <UpdateBanner
              v-if="swUpdateReady && !swUpdateDismissed"
              :applying="swUpdateApplying"
              @apply="applyUpdate()"
              @later="swUpdateDismissed = true"
            />
          </div>
          <div class="app-outlet">
            <IonRouterOutlet />
          </div>
        </main>
        <!--
          G-9's second pane. A screen that has a detail pane teleports it in
          here (M5 is the only one today); empty, it takes no width. It is a
          sibling of the column rather than a layer over it because that is
          the only place from which it can reach the window's edge: Ionic
          gives `.ion-page` `contain: layout`, so anything positioned inside
          a screen is bounded by the content column.
        -->
        <div :id="PANEL_HOST_ID" class="app-panel-layer"></div>
      </div>
      <TabBar />

      <!-- G-2 detail (FR-19.6): what the glyph means, and what to do about it. -->
      <SheetModal :is-open="syncDetailOpen" @dismiss="syncDetailOpen = false">
        <SyncDetailSheet
          :state="syncStatus.state.value"
          :pending-count="syncStatus.pendingCount.value"
          :queue-durable="syncStatus.queueDurable.value"
          :parked-count="syncStatus.parkedCount.value"
          :parked-reason="syncStatus.parkedReason.value"
          :conflict-count="syncStatus.conflictCount.value"
          :live="syncStatus.live.value"
          :last-failure="syncStatus.lastFailure.value"
          :last-synced-at="syncStatus.lastSyncedAt.value"
          :online="online"
          :mode="mode"
          :can-open-conflicts="mode === 'server' && tripId !== null"
          :storage="storage"
          :last-export-at="lastExport"
          :has-backup-content="hasBackupContent"
          :update-ready="swUpdateReady"
          :update-applying="swUpdateApplying"
          :now="detailNow"
          @close="syncDetailOpen = false"
          @conflicts="openConflicts"
          @master-conflicts="openMasterConflicts"
          @backup="saveBackup"
          @apply-update="applyUpdate()"
          @open-trip="openOnlineTrip"
        />
      </SheetModal>
    </template>
  </IonApp>
</template>

<style>
.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  height: calc(100% - var(--jp-app-bar-h)); /* below the header toolbar */
}

/* The FR-19.7 banner's layer — see ADR-060 and its amendment 1.

   `height: 0` is the whole mechanism: the banner overflows a box that
   contributes no height, so its arrival reflows nothing. Being a child of
   the column rather than fixed to the window is what gives it the measure
   and the rail inset without a second copy of either token, and what puts
   it below the head. z-index 30 clears M5's desktop panel (20); Ionic's
   overlays sit far above and still cover it, which is right. */
.app-banner-layer {
  position: sticky;
  z-index: 30;
  top: 0;
  height: 0;
}

.app-content {
  flex: 1;
  overflow: auto;
  /* The head is a band above the outlet rather than a layer over it, so the
     column is a column. */
  display: flex;
  flex-direction: column;
  margin-inline: auto;
  width: 100%;
  max-width: var(--jp-measure);
  /* G-9's content column (UX-17). One rule for every screen, and here
     rather than per view: a screen that had to remember to cap itself is
     a screen that will forget. Below the measure the cap is inert, which
     is why it needs no breakpoint of its own. One measure rather than the
     two of FR-21.18, because the trip's four views are peers a tap apart
     (ADR-051) and a column that changed width between them moved the page
     under the reader — see FR-21.26. */
}

/* The frame's third column (ADR-064). `display: flex` is what stretches the
   pane to the row's height, and `:empty` is what keeps the frame a two-column
   row on every screen that has no pane open rather than a three-column one
   with a zero-width member. No `height` here: this is a flex item of
   `.app-body`, so it is already stretched to the row — measured, because the
   declaration looked necessary and was not. */
.app-panel-layer {
  display: flex;
  flex: none;
}

.app-panel-layer:empty {
  display: none;
}

.app-outlet {
  flex: 1;
  /* Ionic's router outlet is position:absolute. Without a positioned
     ancestor here it resolves against ion-app and covers the header
     strip, which is how seventeen back buttons ended up unreachable
     (ADR-011). */
  position: relative;
  min-height: 0;
}

/*
 * The app's one undo snackbar (FR-25.2 and every act that reuses its shape —
 * FR-7.3/7.4's task toasts, FR-27.16's rename, FR-30.9's bulk tag, FR-25.11j's
 * purchase). Lives here rather than on the screen that first needed it: every
 * route below `App.vue` is a lazy chunk (M4's `PackingListPage.vue`, M6's
 * `ShoppingPage.vue`, …), and Ionic renders a toast into the app root —
 * unscoped CSS living in a chunk that has not loaded yet never reaches it.
 * `App.vue` itself is not lazy, so this is the one place the rule is always
 * present regardless of which screen raised the toast (found 2026-09-22: a
 * shopping-list undo landed in Ionic's stock palette, unreadable, because
 * PackingListPage.vue's own copy of this rule had never loaded).
 */
.pack-toast {
  --background: var(--ct-surface1);
  --color: var(--ct-text);
  --border-color: var(--ct-surface2);
  --border-width: 1px;
  --border-style: solid;
  --border-radius: var(--jp-r-md);
  --box-shadow: var(--jp-shadow);
  --button-color: var(--jp-brand);
}
</style>
