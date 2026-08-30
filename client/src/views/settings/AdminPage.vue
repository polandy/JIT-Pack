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
import { API } from '@/api/routes'
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonChip,
  actionSheetController,
  alertController,
} from '@ionic/vue'
import { inject, onMounted, ref } from 'vue'

import UserAvatar from '@/components/global/UserAvatar.vue'
import { adminActionsFor, type AdminAction, type AdminUserRow } from '@/domain/admin'
import { serverBaseUrl } from '@/config'
import { formatDate, t, type MessageKey } from '@/i18n'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const users = ref<AdminUserRow[]>([])
/**
 * Cache-busting counter for the avatar URLs, bumped when one is removed
 * (FR-23.4, M17's own pattern for FR-17.13).
 *
 * Without it *Remove avatar* changes nothing on the screen that just did it:
 * the row is keyed by user id, so reloading the list hands the same `<img>`
 * the same `src` and the browser never asks again — and it would not be told
 * anything if it did, since the avatar response carries `max-age=3600`.
 * Moderation that leaves the picture on the moderator's screen reads as an
 * action that did not happen.
 */
const avatarVersion = ref(0)
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

/** One catalogue key per action `adminActionsFor` can return (FR-23.3/23.4). */
const ACTION_KEYS: Record<AdminAction, MessageKey> = {
  deactivate: 'admin.actionDeactivate',
  reactivate: 'admin.actionReactivate',
  'reset-avatar': 'admin.actionResetAvatar',
  'reset-name': 'admin.actionResetName',
}

async function openActions(user: AdminUserRow) {
  const actions = adminActionsFor(user, myUserId.value)
  const sheet = await actionSheetController.create({
    header: user.display_name || user.user_id,
    buttons: [
      ...actions.map((a) => ({
        text: t(ACTION_KEYS[a]),
        role: a === 'deactivate' ? 'destructive' : undefined,
        data: a,
      })),
      { text: t('common.cancel'), role: 'cancel' },
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
        avatarVersion.value++
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
    header: t('admin.deactivateTitle', { name: user.display_name || user.user_id }),
    message: t('admin.deactivateMessage'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('admin.actionDeactivate'), role: 'destructive' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  return role === 'destructive'
}

function avatarUrl(user: AdminUserRow): string {
  return `${serverBaseUrl()}${API.userAvatar(user.user_id)}?v=${avatarVersion.value}`
}

/**
 * `toLocaleDateString()` with no locale follows the *device*, not the app —
 * so an English instance on a German phone printed `28.8.2026` under
 * "Provisioned". The same defect the conflict log had (E2E-G2-01, 2026-08-24).
 */
function provisioned(user: AdminUserRow): string {
  return formatDate(new Date(user.created_at))
}
</script>

<template>
  <IonPage>
    <IonContent>
      <IonNote v-if="failed" class="hint" data-testid="admin-unavailable">{{
        t('admin.unavailable')
      }}</IonNote>

      <IonList v-else data-testid="admin-list">
        <IonItem
          v-for="user in users"
          :key="user.user_id"
          button
          :class="{ deactivated: !!user.deactivated_at }"
          :data-testid="`admin-row-${user.display_name || user.user_id}`"
          @click="openActions(user)"
        >
          <UserAvatar
            slot="start"
            class="avatar"
            :name="user.display_name || user.user_id"
            :seed="user.user_id"
            :src="avatarUrl(user)"
            :size="40"
          />
          <IonLabel>
            <h3>
              {{ user.display_name || user.user_id }}
              <span v-if="user.user_id === myUserId" class="self-marker" data-testid="admin-self">
                {{ t('admin.self') }}
              </span>
            </h3>
            <p v-if="user.email">{{ user.email }}</p>
            <p>
              {{ t('admin.provisioned', { date: provisioned(user) }) }} ·
              {{ t('admin.tripCount', { n: user.trip_count }) }} ·
              {{ t('admin.templateCount', { n: user.template_count }) }}
            </p>
          </IonLabel>
          <IonChip v-if="user.is_instance_admin" outline disabled data-testid="admin-role-chip">{{
            t('role.admin')
          }}</IonChip>
          <IonChip
            v-if="user.deactivated_at"
            outline
            disabled
            color="danger"
            data-testid="admin-deactivated-chip"
          >
            {{ t('admin.deactivated') }}
          </IonChip>
        </IonItem>
      </IonList>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.avatar {
  margin-inline-end: 16px;
}

.self-marker {
  color: var(--ion-color-medium);
  font-weight: var(--jp-weight-regular);
}

.deactivated {
  opacity: 0.55;
}

.hint {
  display: block;
  margin: 16px;
}
</style>
