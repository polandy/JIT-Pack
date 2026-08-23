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
import { IonApp, IonRouterOutlet, toastController } from '@ionic/vue'
import AppHeader from '@/components/global/AppHeader.vue'
import NavRail from '@/components/global/NavRail.vue'
import TabBar from '@/components/global/TabBar.vue'
import ModeSelectionPage from '@/views/ModeSelectionPage.vue'
import { AUTH_EXPIRED_EVENT, createAuthRefresher } from '@/auth/refresh'
import { loadTokens } from '@/auth/tokens'
import {
  describeNotification,
  notificationRoute,
  type ServerNotification,
} from '@/notifications/format'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import type { ConflictReport } from '@/composables/useSyncOutbox'
import { serverBaseUrl } from '@/config'
import { IndexedDBPersistence } from '@/local/persistence'
import SheetModal from '@/components/global/SheetModal.vue'
import SyncDetailSheet from '@/components/global/SyncDetailSheet.vue'
import { backupFilename, buildBackup } from '@/local/backup'
import { lastExportAt, markExported } from '@/local/exportReminder'
import { readStorageStatus, type StorageStatus } from '@/local/storageStatus'
import { saveText } from '@/lib/download'
import { swUpdateReady } from '@/pwa/register'
import { t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { provide, computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const MODE_KEY = 'jitpack_mode'
const SERVER_URL_KEY = 'jitpack_server_url'

const mode = ref(localStorage.getItem(MODE_KEY) as 'local' | 'server' | null)

function chooseMode(selected: 'local' | 'server', serverUrl: string | null) {
  localStorage.setItem(MODE_KEY, selected)
  if (serverUrl) localStorage.setItem(SERVER_URL_KEY, serverUrl)
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
          router.push(
            report.type === 'trip' ? `/trips/${report.id}/conflicts` : '/conflicts/master',
          )
        },
      },
    ],
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

onMounted(async () => {
  // Server Mode without a session: if the server offers OIDC, log in
  // first (Single-User/HS256 servers answer 501 → proceed without).
  if (mode.value === 'server' && !loadTokens() && !window.location.pathname.startsWith('/auth/')) {
    try {
      const resp = await fetch(`${serverBaseUrl()}/api/v1/auth/config`)
      if (resp.ok) {
        router.replace('/login')
      }
    } catch {
      // Server unreachable — the sync indicator will show offline.
    }
  }
  // Session ended for real (IdP rejected the refresh token) → log in again.
  window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired)
  // Awaited: in Local Mode this *is* the hydration from IndexedDB, and the
  // FR-27.4 sweep below must not run against a device whose rows have not
  // arrived yet.
  await orchestrator?.connect()
  // Sync-API §7: the instance owns the G-3 lock window. Not awaited — a
  // slow answer must not delay the first pull, and until it lands the
  // shipped 15-minute default is the right answer anyway.
  void orchestrator?.fetchLockTimeout()
  // Initial pull of master data (no-op in Local Mode)
  await orchestrator?.drainMaster()
  // FR-27.4: a group edited on another device arrives with that pull. The
  // trips that follow it work out what it would mean for them here, so M2
  // can say which ones have a question waiting — nothing is applied.
  orchestrator?.proposeRefreshForLoadedTrips()
})

onUnmounted(() => {
  window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired)
  orchestrator?.disconnect()
})

function onAuthExpired() {
  router.replace('/login')
}

// G-2: tapping the sync indicator opens the detail behind it (FR-19.6).
// It used to navigate straight to a trip's conflict log and do nothing at
// all anywhere else, which left the glyph unexplained on every other screen
// and Local Mode without the storage detail NFR-4.11 requires.
const route = useRoute()
const router = useRouter()

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
  if (id) router.push(`/trips/${id}/conflicts`)
}

function openMasterConflicts() {
  syncDetailOpen.value = false
  router.push('/conflicts/master')
}

const masterStore = useMasterStore()
const tripStore = useTripStore()

/** Whether a backup would contain anything (NFR-4.11). */
const hasBackupContent = computed(
  () => masterStore.templateList.length > 0 || tripStore.tripList.length > 0,
)

/** FR-19.6's one-tap backup: the whole device as one portable file. */
async function saveBackup() {
  const now = Date.now()
  const yaml = buildBackup({
    templates: masterStore.templateList.map((template) => ({
      template,
      items: masterStore.getTemplateItems(template.id),
    })),
    trips: tripStore.tripList.map((trip) => ({
      trip,
      items: tripStore.getItems(trip.id),
      travelers: tripStore.getTravelers(trip.id),
      containers: tripStore.getContainers(trip.id),
      // FR-27.4: how the trip follows its groups travels with it, or a
      // restored device starts asking questions the user already answered.
      sources: tripStore.getTemplateSources(trip.id),
      generated: tripStore.getGeneratedPositions(trip.id),
      appliedChanges: tripStore.getAppliedChanges(trip.id),
    })),
    masterItem: (id) => masterStore.getItem(id),
    template: (id) => masterStore.getTemplate(id),
    composition: masterStore.compositionSource(),
  })
  const filename = backupFilename(now)
  saveText(yaml, filename)
  markExported(now)
  lastExport.value = now
  // The sheet's clock advances with the write it is describing.
  detailNow.value = now
  const toast = await toastController.create({
    message: t('sync.detail.backupSaved', { file: filename }),
    duration: 4000,
    position: 'top',
  })
  await toast.present()
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
          :conflict-count="syncStatus.conflictCount.value"
          :mode="mode"
          :can-open-conflicts="mode === 'server' && tripId !== null"
          :storage="storage"
          :last-export-at="lastExport"
          :has-backup-content="hasBackupContent"
          :update-ready="swUpdateReady"
          :now="detailNow"
          @close="syncDetailOpen = false"
          @conflicts="openConflicts"
          @master-conflicts="openMasterConflicts"
          @backup="saveBackup"
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
}
</style>
