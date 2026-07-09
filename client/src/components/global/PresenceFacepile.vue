<script setup lang="ts">
/**
 * G-10 — Trip presence facepile + group-sync badge (FR-4.6).
 *
 * Advisory only: shows who is currently connected to this trip and
 * whether everyone has caught up ("group in sync"). Rendered only with
 * two or more users, so it naturally disappears in Single-User and
 * Local Mode (G-8). Initials stand in for avatars until user profiles
 * sync to the client.
 */
import { IonChip, IonIcon, IonLabel } from '@ionic/vue'
import { checkmarkDoneOutline } from 'ionicons/icons'
import { computed } from 'vue'

import type { PresenceUser } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ users: PresenceUser[] }>()

const allInSync = computed(() => props.users.length > 0 && props.users.every((u) => u.in_sync))

function initials(userId: string): string {
  return userId.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?'
}
</script>

<template>
  <div class="facepile" aria-label="Currently active members">
    <span
      v-for="user in users"
      :key="user.user_id"
      class="face"
      :class="{ 'in-sync': user.in_sync }"
      :title="`${user.user_id}${user.device_count > 1 ? ` (${user.device_count} devices)` : ''}${user.in_sync ? ' · in sync' : ''}`"
    >
      {{ initials(user.user_id) }}
    </span>
    <IonChip v-if="allInSync" color="success" class="group-sync" title="Everyone has the latest state">
      <IonIcon :icon="checkmarkDoneOutline" />
      <IonLabel>In sync</IonLabel>
    </IonChip>
  </div>
</template>

<style scoped>
.facepile {
  display: inline-flex;
  align-items: center;
}

.face {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--ion-color-medium);
  color: var(--ion-color-medium-contrast);
  font-size: 0.7rem;
  font-weight: 600;
  border: 2px solid var(--ion-background-color, #fff);
  margin-left: -6px;
}

.face:first-child {
  margin-left: 0;
}

.face.in-sync {
  background: var(--ion-color-success);
  color: var(--ion-color-success-contrast);
}

.group-sync {
  height: 24px;
  font-size: 0.7rem;
  margin-left: 8px;
}
</style>
