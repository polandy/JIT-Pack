<script setup lang="ts">
/**
 * M20 — User Administration (Addendum 3.23)
 *
 * Overview of every provisioned account (FR-23.2) with deactivate/
 * reactivate (FR-23.3) and profile moderation (FR-23.4) behind a
 * per-row ActionSheet; `adminActionsFor` decides what a row offers
 * (never Deactivate on admins or the own row, no delete anywhere per
 * FR-23.5, no role toggle per FR-23.1). Entered from M17's
 * Administration row; the server rejects non-admins with 403 — the
 * screen is access-controlled, not merely unlinked.
 */
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBackButton,
  IonButtons,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonChip,
  actionSheetController,
  alertController,
} from '@ionic/vue'
import { inject, onMounted, ref } from 'vue'

import { adminActionsFor, type AdminAction, type AdminUserRow } from '@/domain/admin'
import { serverBaseUrl } from '@/config'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const users = ref<AdminUserRow[]>([])
const myUserId = ref<string | null>(null)
const failed = ref(false)

async function load() {
  try {
    users.value = await orchestrator.fetchAdminUsers()
    failed.value = false
  } catch {
    failed.value = true // non-admin (403) or offline
  }
}

onMounted(async () => {
  const me = await orchestrator.fetchMe()
  myUserId.value = me?.user_id ?? null
  await load()
})

const actionLabels: Record<AdminAction, string> = {
  deactivate: 'Deactivate',
  reactivate: 'Reactivate',
  'reset-avatar': 'Remove avatar',
  'reset-name': 'Reset display name',
}

async function openActions(user: AdminUserRow) {
  const actions = adminActionsFor(user, myUserId.value)
  const sheet = await actionSheetController.create({
    header: user.display_name || user.user_id,
    buttons: [
      ...actions.map((a) => ({
        text: actionLabels[a],
        role: a === 'deactivate' ? 'destructive' : undefined,
        data: a,
      })),
      { text: 'Cancel', role: 'cancel' },
    ],
  })
  await sheet.present()
  const { data, role } = await sheet.onDidDismiss()
  if (role === 'cancel' || !data) return
  await runAction(data as AdminAction, user)
}

async function runAction(action: AdminAction, user: AdminUserRow) {
  if (action === 'deactivate' && !(await confirmDeactivation(user))) return
  try {
    switch (action) {
      case 'deactivate':
        await orchestrator.deactivateUser(user.user_id)
        break
      case 'reactivate':
        await orchestrator.reactivateUser(user.user_id)
        break
      case 'reset-avatar':
        await orchestrator.adminResetAvatar(user.user_id)
        break
      case 'reset-name':
        await orchestrator.adminResetDisplayName(user.user_id)
        break
    }
  } catch {
    // Offline or rejected — the reload below shows the actual state.
  }
  await load()
}

/** FR-23.3: the confirmation spells out exactly what happens. */
async function confirmDeactivation(user: AdminUserRow): Promise<boolean> {
  const alert = await alertController.create({
    header: `Deactivate ${user.display_name || user.user_id}?`,
    message:
      'The account loses all access immediately. Trips, templates, and ' +
      'attributions stay untouched and remain visible to others. Logging ' +
      'in again does not restore access — only Reactivate does.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Deactivate', role: 'destructive' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  return role === 'destructive'
}

function avatarUrl(user: AdminUserRow): string {
  return `${serverBaseUrl()}/api/v1/users/${user.user_id}/avatar`
}

function provisioned(user: AdminUserRow): string {
  return new Date(user.created_at).toLocaleDateString()
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton default-href="/tabs/settings" />
        </IonButtons>
        <IonTitle>User administration</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent>
      <IonNote v-if="failed" class="hint">
        Overview unavailable — instance admins only, and a server connection is required.
      </IonNote>

      <IonList v-else>
        <IonItem
          v-for="user in users"
          :key="user.user_id"
          button
          :class="{ deactivated: !!user.deactivated_at }"
          @click="openActions(user)"
        >
          <img slot="start" class="avatar" :src="avatarUrl(user)" alt="" />
          <IonLabel>
            <h3>
              {{ user.display_name || user.user_id }}
              <span v-if="user.user_id === myUserId" class="self-marker">(you)</span>
            </h3>
            <p v-if="user.email">{{ user.email }}</p>
            <p>
              Provisioned {{ provisioned(user) }} · {{ user.trip_count }} trip(s) ·
              {{ user.template_count }} template(s)
            </p>
          </IonLabel>
          <IonChip v-if="user.is_instance_admin" outline disabled>Admin</IonChip>
          <IonChip v-if="user.deactivated_at" outline disabled color="danger">Deactivated</IonChip>
        </IonItem>
      </IonList>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--ion-color-light);
  object-fit: cover;
}

.self-marker {
  color: var(--ion-color-medium);
  font-weight: normal;
}

.deactivated {
  opacity: 0.55;
}

.hint {
  display: block;
  margin: 16px;
}
</style>
