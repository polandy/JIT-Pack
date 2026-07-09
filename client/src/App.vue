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
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import AppHeader from '@/components/global/AppHeader.vue'
import NavRail from '@/components/global/NavRail.vue'
import ModeSelectionPage from '@/views/ModeSelectionPage.vue'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
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

const baseUrl =
  localStorage.getItem(SERVER_URL_KEY) ??
  ((import.meta.env.VITE_API_URL as string) || 'http://localhost:8080')

const orchestrator = mode.value
  ? useSyncOrchestrator({
      baseUrl,
      getToken: () => null, // Single-User mode default; OIDC wires auth.getToken here
      local: mode.value === 'local' ? new IndexedDBPersistence() : undefined,
    })
  : null

provide('orchestrator', orchestrator)

const syncStatus = orchestrator?.syncStatus ?? null

onMounted(() => {
  orchestrator?.connect()
  // Initial pull of master data (no-op in Local Mode)
  orchestrator?.drainMaster()
})

onUnmounted(() => {
  orchestrator?.disconnect()
})

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
