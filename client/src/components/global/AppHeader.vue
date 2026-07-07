<script setup lang="ts">
/**
 * Global app header (G-9): logo (links to dashboard), sync indicator (G-2),
 * settings icon (G-1 — gear in single-user mode, avatar otherwise).
 */
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon } from '@ionic/vue'
import { settingsOutline } from 'ionicons/icons'
import { useRouter } from 'vue-router'
import SyncIndicator from './SyncIndicator.vue'
import type { SyncState } from '@/composables/useSyncStatus'

defineProps<{
  syncState: SyncState
  syncPendingCount: number
  syncLabel: string
}>()

const emit = defineEmits<{
  syncTap: []
}>()

const router = useRouter()

function goHome() {
  router.push('/tabs/dashboard')
}
</script>

<template>
  <IonHeader>
    <IonToolbar>
      <IonTitle slot="start" class="app-logo" @click="goHome">
        <span class="logo-mark">JP</span>
        <span class="logo-wordmark">JIT-Pack</span>
      </IonTitle>

      <IonButtons slot="end">
        <SyncIndicator
          :state="syncState"
          :pending-count="syncPendingCount"
          :label="syncLabel"
          @tap="emit('syncTap')"
        />
        <IonButton router-link="/tabs/settings" aria-label="Settings">
          <IonIcon slot="icon-only" :icon="settingsOutline" />
        </IonButton>
      </IonButtons>
    </IonToolbar>
  </IonHeader>
</template>

<style scoped>
.app-logo {
  cursor: pointer;
}

.logo-mark {
  font-weight: 700;
  font-size: 1.1rem;
}

.logo-wordmark {
  font-weight: 700;
  font-size: 1.1rem;
  display: none;
}

/* G-9: show full wordmark on desktop */
@media (min-width: 900px) {
  .logo-mark {
    display: none;
  }
  .logo-wordmark {
    display: inline;
  }
}
</style>
