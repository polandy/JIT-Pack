<script setup lang="ts">
/**
 * Trip Members — member management for a shared trip (FR-4.5/4.7).
 *
 * Entered from the M2 Share slide option. Owner/Admin add accounts,
 * change Editor/Admin roles, and remove members; Editors see the
 * roster read-only. The creator's Owner row is immutable — the server
 * enforces the same rules again on push, this page only mirrors them
 * (`buildRosterView`). Only reachable with an OIDC session (G-8):
 * Single-User and Local Mode never render a Share entry.
 */
import {
  IonPage,
  IonContent,
  IonButton,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonChip,
} from '@ionic/vue'
import { closeOutline, peopleOutline } from 'ionicons/icons'
import { computed, inject, onMounted, ref } from 'vue'

import { buildRosterView, type DirectoryUser } from '@/domain/members'
import { t } from '@/i18n'
import { roleLabel } from '@/lib/roleLabels'
import { useTripStore } from '@/stores/tripStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { setHeaderTitle } from '@/composables/useHeaderTitle'

const props = defineProps<{ tripId: string }>()

const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const tripStore = useTripStore()

const directory = ref<DirectoryUser[]>([])
const myUserId = ref<string | null>(null)

onMounted(async () => {
  const [users, me] = await Promise.all([orchestrator.fetchUsers(), orchestrator.fetchMe()])
  directory.value = users
  myUserId.value = me?.user_id ?? null
})

const view = computed(() =>
  buildRosterView(tripStore.getMembers(props.tripId), directory.value, myUserId.value),
)

function addMember(userId: string) {
  if (!userId) return
  orchestrator.addTripMember(props.tripId, userId, 'editor')
}

function changeRole(memberId: string, role: 'admin' | 'editor') {
  const member = tripStore.getMembers(props.tripId).find((m) => m.id === memberId)
  if (member) orchestrator.setTripMemberRole(member, role)
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() =>
  t('members.headerTitle', { trip: tripStore.getTrip(props.tripId)?.name ?? '' }),
)
</script>

<template>
  <IonPage>
    <IonContent>
      <IonList v-if="view.rows.length > 0">
        <IonItem
          v-for="row in view.rows"
          :key="row.member.id"
          lines="inset"
          :data-testid="`member-row-${row.displayName}`"
        >
          <IonLabel>
            {{ row.displayName
            }}<span v-if="row.isSelf" class="self-marker">{{ t('members.self') }}</span>
          </IonLabel>

          <!-- The creator's Owner row is immutable (FR-4.7) -->
          <IonChip v-if="!row.mutable" outline disabled>{{ roleLabel(row.member.role) }}</IonChip>
          <IonSelect
            v-else
            interface="popover"
            :aria-label="t('role.label')"
            :value="row.member.role"
            @ionChange="(e: CustomEvent) => changeRole(row.member.id, e.detail.value)"
          >
            <IonSelectOption value="editor">{{ t('role.editor') }}</IonSelectOption>
            <IonSelectOption value="admin">{{ t('role.admin') }}</IonSelectOption>
          </IonSelect>

          <IonButton
            v-if="row.mutable"
            slot="end"
            fill="clear"
            color="medium"
            :aria-label="t('members.remove')"
            @click="orchestrator.removeTripMember(row.member.id)"
          >
            <IonIcon slot="icon-only" :icon="closeOutline" />
          </IonButton>
        </IonItem>
      </IonList>

      <!-- Empty state (G-7): roster not synced yet, or a pre-sync trip -->
      <div v-else class="empty-state">
        <IonIcon :icon="peopleOutline" class="empty-icon" />
        <p>{{ t('members.empty') }}</p>
      </div>

      <template v-if="view.canManage">
        <IonItem v-if="view.candidates.length > 0" lines="none">
          <IonSelect
            interface="popover"
            data-testid="members-add"
            :placeholder="t('members.addUser')"
            :aria-label="t('members.addUserLabel')"
            :value="null"
            @ionChange="(e: CustomEvent) => addMember(e.detail.value)"
          >
            <IonSelectOption v-for="u in view.candidates" :key="u.user_id" :value="u.user_id">
              {{ u.display_name }}
            </IonSelectOption>
          </IonSelect>
        </IonItem>
        <IonNote v-else class="hint">{{ t('members.allAdded') }}</IonNote>
        <IonNote class="hint">{{ t('members.roleNote') }}</IonNote>
      </template>
      <IonNote v-else-if="view.myRole === 'editor'" class="hint">
        {{ t('members.readOnly') }}
      </IonNote>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.self-marker {
  color: var(--ion-color-medium);
}

.hint {
  display: block;
  font-size: var(--jp-text-sm);
  margin: 8px 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--ion-color-medium);
  margin-top: 48px;
}

.empty-icon {
  font-size: var(--jp-icon-2xl);
  margin-bottom: 16px;
}
</style>
