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

import { t } from '@/i18n'
import type { PresenceUser } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ users: PresenceUser[] }>()

const allInSync = computed(() => props.users.length > 0 && props.users.every((u) => u.in_sync))

/**
 * The hover title of one face: who, on how many devices, and whether they
 * have caught up. Assembled here rather than in the template because two of
 * its three parts are conditional and one of them is pluralized.
 */
function faceTitle(user: PresenceUser): string {
  const devices =
    user.device_count > 1 ? ` ${t('presence.deviceCount', { n: user.device_count })}` : ''
  return `${user.user_id}${devices}${user.in_sync ? t('presence.inSyncSuffix') : ''}`
}

function initials(userId: string): string {
  return (
    userId
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 2)
      .toUpperCase() || '?'
  )
}
</script>

<template>
  <div class="facepile" :aria-label="t('presence.activeMembers')">
    <span
      v-for="user in users"
      :key="user.user_id"
      class="face"
      :class="{ 'in-sync': user.in_sync }"
      :title="faceTitle(user)"
    >
      {{ initials(user.user_id) }}
    </span>
    <IonChip v-if="allInSync" color="success" class="group-sync" :title="t('presence.allInSync')">
      <IonIcon :icon="checkmarkDoneOutline" />
      <IonLabel>{{ t('presence.inSync') }}</IonLabel>
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
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-semibold);
  border: 2px solid var(--ion-background-color);
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
  font-size: var(--jp-text-2xs);
  margin-left: 8px;
}
</style>
