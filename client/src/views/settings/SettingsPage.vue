<script setup lang="ts">
/**
 * M17 — Settings (personal preferences only; no admin functions, the
 * instance is configured declaratively per PRD Section 2).
 *
 * Profile: in Single-User Mode (no OIDC session) the display name and
 * avatar are editable per FR-17.13 — the avatar is center-cropped to a
 * 256×256 JPEG on-device (pan/zoom crop positioning deferred). With an
 * OIDC session the profile is read-only (IdP-sourced). Local Mode has
 * no server identity, so the section is a note.
 *
 * Data: NFR-4.5 exports (full JSON, per-trip CSV). Local Mode points to
 * the portable YAML path instead.
 *
 * Notifications (FR-6.2/NFR-4.6): per-kind toggles + the Web Push
 * opt-in for this device. Only with an OIDC session — Single-User and
 * Local Mode have no second party (FR-17.3/FR-19.3, G-8).
 */
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBackButton,
  IonButtons,
  IonButton,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonNote,
  IonIcon,
  IonToggle,
} from '@ionic/vue'
import { downloadOutline, personCircleOutline } from 'ionicons/icons'
import { computed, inject, onMounted, ref } from 'vue'

import { loadTokens } from '@/auth/tokens'
import { serverBaseUrl } from '@/config'
import type { NotificationPrefs } from '@/notifications/format'
import { pushRegistered, pushSupported, registerPush, unregisterPush } from '@/notifications/push'
import { serializeTemplate, serializeTrip } from '@/domain/portable'
import { safeFilename, saveBlob, saveText } from '@/lib/download'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const tripStore = useTripStore()
const masterStore = useMasterStore()

const mode = localStorage.getItem('jitpack_mode') as 'local' | 'server' | null
/** OIDC session → profile is IdP-sourced and read-only (UI-Spec M17). */
const editable = mode === 'server' && !loadTokens()
/** Multi-user instance → notifications exist (FR-17.3/FR-19.3 hide them otherwise). */
const collaborative = mode === 'server' && !!loadTokens()

const me = ref<{ user_id: string; display_name: string } | null>(null)
const nameDraft = ref('')
const nameSaved = ref(false)
const avatarVersion = ref(0)

onMounted(async () => {
  me.value = await orchestrator.fetchMe()
  nameDraft.value = me.value?.display_name ?? ''
  if (collaborative) {
    prefs.value = await orchestrator.fetchNotificationPrefs()
    pushOn.value = await pushRegistered()
  }
})

// --- Notifications (FR-6.2 / NFR-4.6) ---

const prefs = ref<NotificationPrefs | null>(null)
const pushOn = ref(false)
const pushAvailable = pushSupported()

const prefLabels: { kind: keyof NotificationPrefs; label: string; hint: string }[] = [
  { kind: 'delegation', label: 'Delegations', hint: 'An item was handed to you to pack' },
  { kind: 'mention', label: 'Mentions', hint: 'Someone wrote @you in a comment' },
  { kind: 'task', label: 'Tasks', hint: 'A task was opened on your item' },
]

async function togglePref(kind: keyof NotificationPrefs, enabled: boolean) {
  if (!prefs.value) return
  prefs.value = { ...prefs.value, [kind]: enabled }
  await orchestrator.saveNotificationPrefs(prefs.value)
}

async function togglePush(enabled: boolean) {
  if (enabled) {
    pushOn.value = await registerPush(orchestrator.pushApi)
  } else {
    await unregisterPush(orchestrator.pushApi)
    pushOn.value = false
  }
}

// FR-17.13: max 50 chars, [A-Za-z0-9._-] only, validated inline.
const nameValid = computed(() => /^[A-Za-z0-9._-]{1,50}$/.test(nameDraft.value))

async function saveName() {
  if (!me.value || !nameValid.value) return
  await orchestrator.saveDisplayName(me.value.user_id, nameDraft.value)
  me.value = { ...me.value, display_name: nameDraft.value }
  nameSaved.value = true
  setTimeout(() => (nameSaved.value = false), 2000)
}

const avatarUrl = computed(() =>
  me.value ? `${serverBaseUrl()}/api/v1/users/${me.value.user_id}/avatar?v=${avatarVersion.value}` : null,
)

/** Center-crop the picked photo to a 256×256 JPEG on-device (FR-17.13). */
async function onAvatarFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !me.value) return
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  canvas.getContext('2d')!.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, 256, 256,
  )
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.8),
  )
  if (!blob) return
  await orchestrator.uploadAvatar(me.value.user_id, blob)
  avatarVersion.value++
}

// --- Data section (NFR-4.5; Local Mode: portable YAML per NFR-4.11) ---

const csvTripId = ref('')
const yamlTripId = ref('')
const yamlTemplateId = ref('')

/** Local Mode backup: client-side YAML — there is no server to ask. */
function exportTripYAML() {
  const trip = tripStore.getTrip(yamlTripId.value)
  if (!trip) return
  const yaml = serializeTrip({
    trip,
    items: tripStore.getItems(trip.id),
    travelers: tripStore.getTravelers(trip.id),
    containers: tripStore.getContainers(trip.id),
    includeProgress: true,
  })
  saveText(yaml, `${safeFilename(trip.name)}.yaml`)
}

function exportTemplateYAML() {
  const template = masterStore.getTemplate(yamlTemplateId.value)
  if (!template) return
  const yaml = serializeTemplate(
    template,
    masterStore.getTemplateItems(template.id),
    (id) => masterStore.getItem(id),
  )
  saveText(yaml, `${safeFilename(template.name)}.yaml`)
}

async function exportFull() {
  const blob = await orchestrator.downloadExport('/api/v1/export/full')
  if (blob) saveBlob(blob, 'jitpack-export.json')
}

async function exportTripCSV() {
  if (!csvTripId.value) return
  const blob = await orchestrator.downloadExport(`/api/v1/trips/${csvTripId.value}/export.csv`)
  const trip = tripStore.getTrip(csvTripId.value)
  if (blob) saveBlob(blob, `${trip?.name ?? 'trip'}.csv`)
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton default-href="/tabs/dashboard" />
        </IonButtons>
        <IonTitle>Settings</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <!-- Profile (FR-17.13) -->
      <h2 class="section-title">Profile</h2>
      <template v-if="mode === 'local'">
        <IonNote>Local Mode has no account — everything stays on this device.</IonNote>
      </template>
      <template v-else-if="me">
        <div class="avatar-row">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            class="avatar"
            alt="Avatar"
            @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
          />
          <IonIcon v-else :icon="personCircleOutline" class="avatar-placeholder" />
          <label v-if="editable" class="avatar-upload">
            Change picture
            <input type="file" accept="image/*" hidden @change="onAvatarFile" />
          </label>
        </div>
        <IonList>
          <IonItem>
            <IonInput
              label="Display name"
              label-placement="stacked"
              :value="nameDraft"
              :readonly="!editable"
              :maxlength="50"
              @ionInput="(e: CustomEvent) => (nameDraft = e.detail.value ?? '')"
            />
            <IonButton
              v-if="editable"
              slot="end"
              size="small"
              :disabled="!nameValid || nameDraft === me.display_name"
              @click="saveName"
            >
              {{ nameSaved ? 'Saved' : 'Save' }}
            </IonButton>
          </IonItem>
        </IonList>
        <IonNote v-if="editable && !nameValid" color="danger">
          1–50 characters, letters/digits/._- only.
        </IonNote>
        <IonNote v-else-if="!editable">Profile is managed by your identity provider.</IonNote>
      </template>
      <IonNote v-else>Profile unavailable — server not reachable.</IonNote>

      <!-- Notifications (FR-6.2 / NFR-4.6) — multi-user only (G-8) -->
      <template v-if="collaborative">
        <h2 class="section-title">Notifications</h2>
        <IonList v-if="prefs">
          <IonItem v-for="p in prefLabels" :key="p.kind">
            <IonLabel>
              <h3>{{ p.label }}</h3>
              <p>{{ p.hint }}</p>
            </IonLabel>
            <IonToggle
              slot="end"
              :checked="prefs[p.kind]"
              :aria-label="p.label"
              @ionChange="(e: CustomEvent) => togglePref(p.kind, e.detail.checked)"
            />
          </IonItem>
          <IonItem>
            <IonLabel>
              <h3>Push on this device</h3>
              <p>{{ pushAvailable ? 'OS notifications while the app is closed' : 'Not supported by this browser' }}</p>
            </IonLabel>
            <IonToggle
              slot="end"
              :checked="pushOn"
              :disabled="!pushAvailable"
              aria-label="Push on this device"
              @ionChange="(e: CustomEvent) => togglePush(e.detail.checked)"
            />
          </IonItem>
        </IonList>
        <IonNote v-else>Notification settings unavailable — server not reachable.</IonNote>
      </template>

      <!-- Data (NFR-4.5) -->
      <h2 class="section-title">Data</h2>
      <template v-if="mode === 'local'">
        <IonNote>
          Backup in Local Mode is the portable YAML export — there is no server
          copy of your data. Files re-import via the trip/template import.
        </IonNote>
        <IonList>
          <IonItem>
            <IonSelect
              label="Trip (YAML)"
              interface="popover"
              :value="yamlTripId"
              @ionChange="(e: CustomEvent) => (yamlTripId = e.detail.value)"
            >
              <IonSelectOption v-for="trip in tripStore.tripList" :key="trip.id" :value="trip.id">
                {{ trip.name }}
              </IonSelectOption>
            </IonSelect>
            <IonButton slot="end" size="small" :disabled="!yamlTripId" @click="exportTripYAML">
              Download
            </IonButton>
          </IonItem>
          <IonItem>
            <IonSelect
              label="Template (YAML)"
              interface="popover"
              :value="yamlTemplateId"
              @ionChange="(e: CustomEvent) => (yamlTemplateId = e.detail.value)"
            >
              <IonSelectOption v-for="tpl in masterStore.templateList" :key="tpl.id" :value="tpl.id">
                {{ tpl.name }}
              </IonSelectOption>
            </IonSelect>
            <IonButton slot="end" size="small" :disabled="!yamlTemplateId" @click="exportTemplateYAML">
              Download
            </IonButton>
          </IonItem>
        </IonList>
      </template>
      <template v-else>
        <IonList>
          <IonItem button :detail="false" @click="exportFull">
            <IonIcon slot="start" :icon="downloadOutline" />
            <IonLabel>
              <h3>Full export (JSON)</h3>
              <p>Everything you can see, as a versioned backup file</p>
            </IonLabel>
          </IonItem>
          <IonItem>
            <IonSelect
              label="Trip packing list (CSV)"
              interface="popover"
              :value="csvTripId"
              @ionChange="(e: CustomEvent) => (csvTripId = e.detail.value)"
            >
              <IonSelectOption v-for="trip in tripStore.tripList" :key="trip.id" :value="trip.id">
                {{ trip.name }}
              </IonSelectOption>
            </IonSelect>
            <IonButton slot="end" size="small" :disabled="!csvTripId" @click="exportTripCSV">
              Download
            </IonButton>
          </IonItem>
        </IonList>
      </template>

      <!-- Conflict log pointer (G-2) -->
      <h2 class="section-title">Conflict log</h2>
      <IonNote>
        Automatic merge resolutions are logged per trip — open a trip and tap the
        sync indicator in the header to review them.
      </IonNote>

      <!-- App info -->
      <h2 class="section-title">About</h2>
      <IonList>
        <IonItem lines="none">
          <IonLabel>
            <h3>JIT-Pack</h3>
            <p>Mode: {{ mode === 'local' ? 'Local (this device only)' : `Server (${serverBaseUrl()})` }}</p>
          </IonLabel>
        </IonItem>
      </IonList>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 20px 0 8px;
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 64px;
  color: var(--ion-color-medium);
}

.avatar-upload {
  color: var(--ion-color-primary);
  cursor: pointer;
  font-size: 0.9rem;
}
</style>
