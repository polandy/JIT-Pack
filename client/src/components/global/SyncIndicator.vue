<script setup lang="ts">
import { IonIcon, IonBadge } from '@ionic/vue'
import {
  cloudDoneOutline,
  syncOutline,
  cloudOfflineOutline,
  phonePortraitOutline,
} from 'ionicons/icons'
import { computed } from 'vue'
import type { SyncState } from '@/composables/useSyncStatus'

const props = defineProps<{
  state: SyncState
  pendingCount: number
  label: string
}>()

const emit = defineEmits<{
  tap: []
}>()

const icons: Record<SyncState, string> = {
  synced: cloudDoneOutline,
  syncing: syncOutline,
  offline: cloudOfflineOutline,
  // FR-19.6: everything lives on this device, no server involved.
  local: phonePortraitOutline,
}

const icon = computed(() => icons[props.state])
</script>

<template>
  <button
    class="sync-indicator"
    :class="state"
    :title="label"
    data-testid="sync-indicator"
    :data-state="state"
    @click="emit('tap')"
  >
    <IonIcon :icon="icon" :class="{ spinning: state === 'syncing' }" />
    <IonBadge v-if="state === 'offline' && pendingCount > 0" color="warning">
      {{ pendingCount }}
    </IonBadge>
  </button>
</template>

<style scoped>
.sync-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  color: var(--ion-color-medium);
}

/*
 * Without this the icon inherits the button's text size and renders at ~13 px
 * beside 25 px neighbours — at which point the Local Mode phone outline has no
 * discernible features left and reads as a missing-glyph box. Reported as
 * "sieht kaputt aus" (owner, 2026-08-16), and it was: an icon size that never
 * came from the table invariant 9 points at.
 */
.sync-indicator ion-icon {
  font-size: var(--jp-icon-md);
}

.sync-indicator.synced {
  color: var(--ion-color-success);
}

.sync-indicator.syncing {
  color: var(--ion-color-primary);
}

.sync-indicator.offline {
  color: var(--ion-color-warning);
}

.sync-indicator.local {
  color: var(--ion-color-medium);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

ion-badge {
  font-size: var(--jp-text-3xs);
  padding: 2px 5px;
}
</style>
