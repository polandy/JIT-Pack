<script setup lang="ts">
/**
 * Root app component — provides AppHeader (G-9) and responsive layout.
 * Desktop (≥900px): left nav rail + content area.
 * Mobile (<900px): content area + bottom tabs (in TabsLayout).
 *
 * First launch shows M19 (FR-19.1) until a mode is chosen; afterwards
 * the persisted mode decides whether the orchestrator runs against a
 * server or against IndexedDB (Local Mode, Addendum 3.19).
 */
import { IonApp, IonRouterOutlet, toastController } from '@ionic/vue'
import AppHeader from '@/components/global/AppHeader.vue'
import NavRail from '@/components/global/NavRail.vue'
import ModeSelectionPage from '@/views/ModeSelectionPage.vue'
import { AUTH_EXPIRED_EVENT, createAuthRefresher } from '@/auth/refresh'
import { loadTokens } from '@/auth/tokens'
import { describeNotification, notificationRoute, type ServerNotification } from '@/notifications/format'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { serverBaseUrl } from '@/config'
import { IndexedDBPersistence } from '@/local/persistence'
import { provide, onMounted, onUnmounted, ref } from 'vue'
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
    })
  : null

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
      ? [{ text: 'Open', handler: () => { router.push(route) } }]
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
  orchestrator?.connect()
  // Initial pull of master data (no-op in Local Mode)
  orchestrator?.drainMaster()
})

onUnmounted(() => {
  window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired)
  orchestrator?.disconnect()
})

function onAuthExpired() {
  router.replace('/login')
}

// G-2: tapping the sync indicator inside a trip opens its conflict log.
const route = useRoute()
const router = useRouter()

function onSyncTap() {
  const tripId = route.params['tripId']
  if (typeof tripId === 'string' && tripId) {
    router.push(`/trips/${tripId}/conflicts`)
  }
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
        @sync-tap="onSyncTap"
      />
      <div class="app-body">
        <NavRail class="desktop-nav" />
        <main class="app-content">
          <IonRouterOutlet />
        </main>
      </div>
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

.desktop-nav {
  display: none;
}

.app-content {
  flex: 1;
  overflow: auto;
}

/* G-9: desktop breakpoint */
@media (min-width: 900px) {
  .desktop-nav {
    display: flex;
  }
}
</style>
