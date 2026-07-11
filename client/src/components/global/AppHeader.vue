<script setup lang="ts">
/**
 * Global app header (G-9): logo (links to dashboard), sync indicator (G-2),
 * settings icon (G-1 — gear in single-user mode, avatar otherwise).
 */
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon } from '@ionic/vue'
import { settingsOutline } from 'ionicons/icons'
import { useRouter } from 'vue-router'
import BrandMark from './BrandMark.vue'
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
        <span class="logo-row">
          <BrandMark :size="22" />
          <span class="logo-wordmark">JIT<i class="logo-dot">·</i>Pack</span>
        </span>
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

.logo-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  vertical-align: middle;
}

.logo-wordmark {
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: -0.02em;
  display: none;
}

.logo-dot {
  font-style: normal;
  color: var(--ion-color-primary);
}

/* G-9: mark only on mobile, mark + wordmark on desktop */
@media (min-width: 900px) {
  .logo-wordmark {
    display: inline;
  }
}
</style>
