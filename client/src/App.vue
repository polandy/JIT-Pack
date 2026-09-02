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
import NavRail from '@/components/global/NavRail.vue'
import TabBar from '@/components/global/TabBar.vue'
import MigrationBanner from '@/components/global/MigrationBanner.vue'
import UpdateBanner from '@/components/global/UpdateBanner.vue'
import ModeSelectionPage from '@/views/ModeSelectionPage.vue'
import { createAuthRefresher, onSessionEnded } from '@/auth/refresh'
import { loadTokens } from '@/auth/tokens'
import {
  describeNotification,
  notificationRoute,
  type ServerNotification,
} from '@/notifications/format'
import { startNotificationMirror } from '@/notifications/mirror'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
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
import { PATH, tripSubPath } from '@/router/paths'
import { confirmAction } from '@/lib/confirm'

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

provide('orchestrator', orchestrator)

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

// A session that ends — the IdP refusing the refresh, or the account
// deactivated (FR-23.3) — returns to the login. Attached here, in setup,
// because a child's `onMounted` makes the request that can end it before
// this component's own `onMounted` gets past its awaits (see `onSessionEnded`).
const stopSessionEnd = onSessionEnded(() => router.replace('/login'))

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
  lastExport.value = lastExportAt()
  storage.value = mode.value === 'local' ? await readStorageStatus() : null
  syncDetailOpen.value = true
}

function openConflicts() {
  const id = tripId.value
  syncDetailOpen.value = false
  if (id) router.push(tripSubPath(id, 'conflicts'))
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
      <!--
        FR-19.7: the one-press offer. Under the bar rather than inside the
        G-2 sheet, because the sheet's offer costs knowing what the dot means.
      -->
      <UpdateBanner
        v-if="swUpdateReady && !swUpdateDismissed"
        :applying="swUpdateApplying"
        @apply="applyUpdate()"
        @later="swUpdateDismissed = true"
      />
      <!-- FR-19.8: step three of the move, until the restore commits or is declined. -->
      <MigrationBanner
        v-if="mode === 'server' && migrationPending"
        @restore="restoreMigration"
        @skip="skipMigration"
      />
      <div class="app-body">
        <NavRail />
        <main class="app-content">
          <IonRouterOutlet />
        </main>
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
  height: calc(100% - 56px); /* below the header toolbar */
}

.app-content {
  flex: 1;
  overflow: auto;
  /* Ionic's router outlet is position:absolute. Without a positioned
     ancestor here it resolves against ion-app and covers the header
     strip, which is how seventeen back buttons ended up unreachable
     (ADR-011). */
  position: relative;
  max-width: 960px;
  margin-inline: auto;
  width: 100%;
  /* G-9's content column (UX-17). One rule for every screen, and here
     rather than per view: a screen that had to remember to cap itself is
     a screen that will forget. Sized so a line of body copy stays in the
     readable range rather than to a device — below it the cap is inert,
     which is why it needs no breakpoint of its own. */
}
</style>
