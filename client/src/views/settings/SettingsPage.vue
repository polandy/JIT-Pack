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
 *
 * Appearance (FR-21.3): opt-in light theme (Catppuccin Latte), a
 * device-local display preference — shown in every mode, never synced.
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
  alertController,
} from '@ionic/vue'
import { downloadOutline, personCircleOutline, warningOutline } from 'ionicons/icons'
import { computed, inject, onMounted, ref } from 'vue'
import {
  EXPORT_REMINDER_DAYS,
  lastExportAt,
  markExported,
  reminderState,
} from '@/local/exportReminder'

import { loadTokens } from '@/auth/tokens'
import { serverBaseUrl } from '@/config'
import type { NotificationPrefs } from '@/notifications/format'
import { pushRegistered, pushSupported, registerPush, unregisterPush } from '@/notifications/push'
import { serializeTemplate, serializeTrip } from '@/domain/portable'
import { safeFilename, saveBlob, saveText } from '@/lib/download'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { currentTheme, setTheme } from '@/theme/theme'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const tripStore = useTripStore()
const masterStore = useMasterStore()

const mode = localStorage.getItem('jitpack_mode') as 'local' | 'server' | null
/** OIDC session → profile is IdP-sourced and read-only (UI-Spec M17). */
const editable = mode === 'server' && !loadTokens()
/** Multi-user instance → notifications exist (FR-17.3/FR-19.3 hide them otherwise). */
const collaborative = mode === 'server' && !!loadTokens()

const me = ref<{ user_id: string; display_name: string; is_instance_admin?: boolean } | null>(null)
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

// --- Appearance (FR-21.3, device-local) ---

const lightTheme = ref(currentTheme() === 'latte')

function toggleLightTheme(enabled: boolean) {
  setTheme(enabled ? 'latte' : 'mocha')
  lightTheme.value = enabled
}

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
  me.value
    ? `${serverBaseUrl()}/api/v1/users/${me.value.user_id}/avatar?v=${avatarVersion.value}`
    : null,
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
  canvas
    .getContext('2d')!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
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

// NFR-4.11 export reminder: recomputed on demand so it clears the moment
// a Local Mode backup is downloaded.
const exportReminder = ref(reminderState(lastExportAt(), Date.now()))
function refreshReminder() {
  exportReminder.value = reminderState(lastExportAt(), Date.now())
}

/** Stamp a successful Local Mode backup so the reminder resets (NFR-4.11). */
function recordBackup() {
  markExported()
  refreshReminder()
}

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
  recordBackup()
}

function exportTemplateYAML() {
  const template = masterStore.getTemplate(yamlTemplateId.value)
  if (!template) return
  const yaml = serializeTemplate(template, masterStore.getTemplateItems(template.id), (id) =>
    masterStore.getItem(id),
  )
  saveText(yaml, `${safeFilename(template.name)}.yaml`)
  recordBackup()
}

/** Storage-detail popover (NFR-4.11): how much of the origin's quota the
 * on-device data uses, and whether the browser has promised not to evict
 * it. Both come from the Storage API; absence is reported honestly. */
async function showStorageDetails() {
  let message = 'Storage details are unavailable in this browser.'
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    const persisted = (await navigator.storage.persisted?.()) ?? false
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1)
    message =
      `Used ${mb(usage)} MB of ${mb(quota)} MB available on this device.\n\n` +
      (persisted
        ? 'Storage is persistent — the browser will not evict it automatically.'
        : 'Storage is not marked persistent, so the browser may evict it under pressure. Keep a recent export.')
  }
  const alert = await alertController.create({
    header: 'On-device storage',
    message,
    buttons: ['OK'],
  })
  await alert.present()
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

      <!-- Appearance (FR-21.3) — every mode, this device only -->
      <h2 class="section-title">Appearance</h2>
      <IonList>
        <IonItem>
          <IonLabel>
            <h3>Light theme</h3>
            <p>Catppuccin Latte — dark (Mocha) is the default. This device only.</p>
          </IonLabel>
          <IonToggle
            slot="end"
            :checked="lightTheme"
            aria-label="Light theme"
            @ionChange="(e: CustomEvent) => toggleLightTheme(e.detail.checked)"
          />
        </IonItem>
      </IonList>

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
              <p>
                {{
                  pushAvailable
                    ? 'OS notifications while the app is closed'
                    : 'Not supported by this browser'
                }}
              </p>
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
        <div v-if="exportReminder.due" class="export-reminder">
          <IonIcon :icon="warningOutline" />
          <span>
            {{
              exportReminder.lastAt === null
                ? "You haven't backed up yet — download a copy so your data survives this browser."
                : `Last backup was ${exportReminder.daysSince} days ago. Download a fresh copy (every ${EXPORT_REMINDER_DAYS} days is a good habit).`
            }}
          </span>
        </div>
        <IonNote>
          Backup in Local Mode is the portable YAML export — there is no server copy of your data.
          Files re-import via the trip/template import.
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
              <IonSelectOption
                v-for="tpl in masterStore.templateList"
                :key="tpl.id"
                :value="tpl.id"
              >
                {{ tpl.name }}
              </IonSelectOption>
            </IonSelect>
            <IonButton
              slot="end"
              size="small"
              :disabled="!yamlTemplateId"
              @click="exportTemplateYAML"
            >
              Download
            </IonButton>
          </IonItem>
          <IonItem button :detail="false" @click="showStorageDetails">
            <IonLabel>Storage details</IonLabel>
            <IonNote slot="end">On-device usage</IonNote>
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

      <!-- Administration entry (Addendum 3.23, FR-23.2): instance
           admins with an OIDC session only — same gating as M20. -->
      <template v-if="collaborative && me?.is_instance_admin">
        <h2 class="section-title">Administration</h2>
        <IonList>
          <IonItem button lines="none" @click="$router.push('/admin')">
            <IonLabel>
              <h3>User administration</h3>
              <p>Provisioned accounts, deactivation, profile moderation</p>
            </IonLabel>
          </IonItem>
        </IonList>
      </template>

      <!-- Conflict log pointer (G-2) -->
      <h2 class="section-title">Conflict log</h2>
      <IonNote>
        Automatic merge resolutions are logged per trip — open a trip and tap the sync indicator in
        the header to review them.
      </IonNote>

      <!-- App info -->
      <h2 class="section-title">About</h2>
      <IonList>
        <IonItem lines="none">
          <IonLabel>
            <h3>JIT-Pack</h3>
            <p>
              Mode:
              {{ mode === 'local' ? 'Local (this device only)' : `Server (${serverBaseUrl()})` }}
            </p>
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

.export-reminder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-contrast);
  font-size: 0.85rem;
}

.export-reminder ion-icon {
  flex: none;
  font-size: 1.2rem;
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
