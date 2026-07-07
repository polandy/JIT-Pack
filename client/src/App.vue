<script setup lang="ts">
/**
 * Root app component — provides AppHeader (G-9) and responsive layout.
 * Desktop (≥900px): left nav rail + content area.
 * Mobile (<900px): content area + bottom tabs (in TabsLayout).
 */
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import AppHeader from '@/components/global/AppHeader.vue'
import NavRail from '@/components/global/NavRail.vue'
import { useSyncStatus } from '@/composables/useSyncStatus'
import { provide } from 'vue'

const syncStatus = useSyncStatus()
provide('syncStatus', syncStatus)
</script>

<template>
  <IonApp>
    <AppHeader
      :sync-state="syncStatus.state.value"
      :sync-pending-count="syncStatus.pendingCount.value"
      :sync-label="syncStatus.label.value"
    />
    <div class="app-body">
      <NavRail class="desktop-nav" />
      <main class="app-content">
        <IonRouterOutlet />
      </main>
    </div>
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
