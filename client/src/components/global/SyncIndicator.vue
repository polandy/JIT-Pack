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

const icon = computed(() => {
  switch (props.state) {
    case 'synced':
      return cloudDoneOutline
    case 'syncing':
      return syncOutline
    case 'offline':
      return cloudOfflineOutline
    case 'local':
      // FR-19.6: everything lives on this device, no server involved.
      return phonePortraitOutline
  }
})
</script>

<template>
  <button
    class="sync-indicator"
    :class="state"
    :title="label"
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
  font-size: 10px;
  padding: 2px 5px;
}
</style>
