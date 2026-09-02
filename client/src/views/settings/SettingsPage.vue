<script setup lang="ts">
/**
 * M17 — Settings (personal preferences only; no admin functions, the
 * instance is configured declaratively per PRD Section 2).
 *
 * Profile (FR-17.13): the picture is editable wherever there is a server
 * identity — pan/zoom cropped to a 256×256 JPEG on-device (AvatarCropModal)
 * — because no identity provider supplies one, so gating it on Single-User
 * Mode would mean a multi-user instance can never have one. The display
 * name is different: with an OIDC session it comes from the IdP, so it
 * stays read-only there rather than becoming an editable copy. Local Mode
 * has no server identity at all, so the section is a note.
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
import { API } from '@/api/routes'
import { API_TOKEN_EXPIRY } from '@/api/types'
import type { APITokenExpiry, MeResponse } from '@/api/types'
import {
  IonPage,
  IonContent,
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
  onIonViewWillEnter,
} from '@ionic/vue'
import {
  addOutline,
  closeOutline,
  downloadOutline,
  personOutline,
  warningOutline,
} from 'ionicons/icons'
import { computed, inject, onMounted, ref } from 'vue'
import {
  EXPORT_REMINDER_DAYS,
  backupCoversDevice,
  lastExportAt,
  lastLocalWriteAt,
  reminderState,
} from '@/local/exportReminder'

import { loadTokens } from '@/auth/tokens'
import { hasCollaborativeSession, readMode, switchToServer } from '@/mode'
import { defaultServerBaseUrl, serverBaseUrl } from '@/config'
import type { NotificationPrefs } from '@/notifications/format'
import { pushRegistered, pushSupported, registerPush, unregisterPush } from '@/notifications/push'
import { isValidDisplayName } from '@/domain/displayName'
import { compositionFrom, serializeTemplate, serializeTrip } from '@/domain/portable'
import { safeFilename, saveBlob, saveText } from '@/lib/download'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { currentTheme, setTheme } from '@/theme/theme'
import { type Locale, type MessageKey, currentLocale, formatNumber, setLocale, t } from '@/i18n'
import UserAvatar from '@/components/global/UserAvatar.vue'
import AvatarCropModal from '@/components/settings/AvatarCropModal.vue'
import ApiTokenSheet from '@/components/settings/ApiTokenSheet.vue'
import LeaveLocalModeCard from '@/components/settings/LeaveLocalModeCard.vue'
import { useDeviceBackup } from '@/composables/useDeviceBackup'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { defaultTravelers } from '@/composables/useDefaultTravelers'
import { PATH } from '@/router/paths'

const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const tripStore = useTripStore()
const masterStore = useMasterStore()

const mode = readMode()
/** OIDC session → profile is IdP-sourced and read-only (UI-Spec M17). */
/**
 * The display name is IdP-sourced with an OIDC session, so editing it there
 * would be editing a copy (FR-17.13).
 */
const nameEditable = mode === 'server' && !loadTokens()
/**
 * The picture is not: no identity provider supplies one, so a read-only
 * profile in Server Mode means the picture can never exist in the mode a
 * multi-user instance actually runs in. Editable wherever there is a server
 * identity at all — Local Mode has none (FR-17.13).
 */
const pictureEditable = mode === 'server'
/** Multi-user instance → notifications exist (FR-17.3/FR-19.3 hide them otherwise). */
const collaborative = hasCollaborativeSession()

const me = ref<MeResponse | null>(null)
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

/**
 * FR-2.5a: the people a new trip starts with. Device-local like the
 * theme beside it, and a starting point rather than a rule — M3 edits
 * them freely.
 */
const travelers = defaultTravelers()
const travelerNames = travelers.names
const newTraveler = ref('')

function addTraveler() {
  travelers.add(newTraveler.value)
  newTraveler.value = ''
}

const lightTheme = ref(currentTheme() === 'latte')

function toggleLightTheme(enabled: boolean) {
  setTheme(enabled ? 'latte' : 'mocha')
  lightTheme.value = enabled
}

// --- Language (NFR-4.12, device-local like the theme) ---

const language = ref<Locale>(currentLocale())

function changeLanguage(next: Locale) {
  setLocale(next)
  language.value = next
}

// --- Notifications (FR-6.2 / NFR-4.6) ---

const prefs = ref<NotificationPrefs | null>(null)
const pushOn = ref(false)
const pushAvailable = pushSupported()

/*
 * Keys, not finished text: a module-level constant is evaluated once at import
 * and a language switch can never reach it — the same trap the nav anchors and
 * route titles were caught in during the i18n migration. `t()` runs during
 * render here, so it tracks the locale.
 */
const prefRows: { kind: keyof NotificationPrefs; label: MessageKey; hint: MessageKey }[] = [
  { kind: 'delegation', label: 'settings.prefDelegation', hint: 'settings.prefDelegationHint' },
  { kind: 'mention', label: 'settings.prefMention', hint: 'settings.prefMentionHint' },
  { kind: 'task', label: 'settings.prefTask', hint: 'settings.prefTaskHint' },
  { kind: 'lock_taken', label: 'settings.prefLockTaken', hint: 'settings.prefLockTakenHint' },
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

// FR-17.13: validated inline, but only after the field was touched — the
// untouched server-provided name must never greet the user with an error.
const nameValid = computed(() => isValidDisplayName(nameDraft.value))
const nameTouched = ref(false)

async function saveName() {
  if (!me.value || !nameValid.value) return
  await orchestrator.saveDisplayName(me.value.user_id, nameDraft.value)
  me.value = { ...me.value, display_name: nameDraft.value }
  nameSaved.value = true
  setTimeout(() => (nameSaved.value = false), 2000)
}

const avatarUrl = computed(() =>
  me.value
    ? `${serverBaseUrl()}${API.userAvatar(me.value.user_id)}?v=${avatarVersion.value}`
    : null,
)

// FR-17.13: the picked photo opens the pan/zoom crop modal; the modal
// hands back a ready 256×256 JPEG.
const cropFile = ref<File | null>(null)
const cropOpen = ref(false)

function onAvatarFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file after cancel
  if (!file || !me.value) return
  cropFile.value = file
  cropOpen.value = true
}

async function onAvatarCropped(blob: Blob) {
  cropOpen.value = false
  if (!me.value) return
  await orchestrator.uploadAvatar(me.value.user_id, blob)
  avatarVersion.value++
}

/**
 * FR-24.3: how many master rows a delete only hid. Shown beside the row so
 * the screen is worth opening — or visibly not.
 */
// --- API tokens (FR-23.7) ---------------------------------------------
//
// The minted token lives in component state and is dropped when the sheet
// closes. It is never written to a store or to localStorage: nothing about a
// token is persisted anywhere, which is the whole of ADR-039.

const tokenName = ref('')
const tokenExpiry = ref<APITokenExpiry>(API_TOKEN_EXPIRY['90d'])
const tokenPending = ref(false)
const tokenFailed = ref(false)
const mintedToken = ref('')
const mintedExpiresAt = ref('')
const tokenSheetOpen = ref(false)

/**
 * The four lifetimes, built as a computed rather than a module constant:
 * finished text in a module-level constant is unreachable by a language
 * switch, which is the trap M17 closed once already.
 */
const tokenExpiryOptions = computed(() => [
  { value: API_TOKEN_EXPIRY['1h'], label: t('settings.tokenExpiry1h') },
  { value: API_TOKEN_EXPIRY['1d'], label: t('settings.tokenExpiry1d') },
  { value: API_TOKEN_EXPIRY['7d'], label: t('settings.tokenExpiry7d') },
  { value: API_TOKEN_EXPIRY['30d'], label: t('settings.tokenExpiry30d') },
  { value: API_TOKEN_EXPIRY['90d'], label: t('settings.tokenExpiry90d') },
  { value: API_TOKEN_EXPIRY['365d'], label: t('settings.tokenExpiry365d') },
  { value: API_TOKEN_EXPIRY.never, label: t('settings.tokenExpiryNever') },
])

async function createToken() {
  tokenPending.value = true
  tokenFailed.value = false
  try {
    const out = await orchestrator.createAPIToken(tokenName.value.trim(), tokenExpiry.value)
    if (!out) {
      tokenFailed.value = true
      return
    }
    mintedToken.value = out.token
    mintedExpiresAt.value = out.expires_at
    tokenSheetOpen.value = true
    tokenName.value = ''
  } catch {
    // Offline, or the server refused it — the sentence is the same either
    // way, because neither is something the person can act on differently.
    tokenFailed.value = true
  } finally {
    tokenPending.value = false
  }
}

/** Closing the reveal is what ends the token's only readable moment. */
function closeTokenSheet() {
  tokenSheetOpen.value = false
  mintedToken.value = ''
  mintedExpiresAt.value = ''
}

const retiredCount = computed(
  () => masterStore.retiredItemList.length + masterStore.retiredTemplateList.length,
)

// --- Data section (NFR-4.5; Local Mode: portable YAML per NFR-4.11) ---

const csvTripId = ref('')
const yamlTripId = ref('')
const yamlTemplateId = ref('')

/*
 * NFR-4.11 export reminder. What it tracks is the **whole-device** backup —
 * the requirement's own words — which is the G-2 storage sheet's one-tap
 * export and nothing else. The two YAML downloads below are a single trip
 * and a single template, and until 2026-08-30 they stamped this same key:
 * exporting one trip silenced the warning about everything the file did not
 * contain. They were written when M17's YAML *was* the only export, and the
 * device backup (ADR-015) arrived beside them without anyone revisiting it.
 */
const exportReminder = ref(reminderState(lastExportAt(), Date.now()))

/*
 * Computed rather than written into the template: the sentence differs by
 * whether a backup was ever made, and the stale form is a plural — both
 * decisions belong to the catalogue, not to a ternary in the markup.
 */
const backupReminderText = computed(() => {
  // Narrowed on daysSince rather than lastAt: they are null together, but only
  // this one is the value being interpolated, and only this one narrows.
  const days = exportReminder.value.daysSince
  return days === null
    ? t('settings.backupNever')
    : t('settings.backupStale', { n: days, every: EXPORT_REMINDER_DAYS })
})

const modeText = computed(() =>
  mode === 'local' ? t('settings.modeLocal') : t('settings.modeServer', { url: serverBaseUrl() }),
)
/**
 * Re-read the stamp whenever the screen is entered. The backup that clears
 * this warning is taken on the G-2 sheet — another component — so a value
 * captured once at setup would go on warning for the rest of the session
 * about a backup the user has just made. Ionic keeps this page mounted,
 * which is exactly why entering has to be the trigger rather than mounting.
 */
function refreshReminder() {
  exportReminder.value = reminderState(lastExportAt(), Date.now())
  backupCovered.value = backupCoversDevice(lastExportAt(), lastLocalWriteAt())
}
onIonViewWillEnter(refreshReminder)

// --- FR-19.8: leaving Local Mode (ADR-045) ---

const { saveBackup: writeDeviceBackup } = useDeviceBackup()

/**
 * The guard on the switch: re-read with the reminder, because the last write
 * is stamped by the orchestrator from whatever screen made it.
 */
const backupCovered = ref(backupCoversDevice(lastExportAt(), lastLocalWriteAt()))

async function backupForMove() {
  await writeDeviceBackup()
  refreshReminder()
}

/** Step 2: the mode, the URL and the pending flag, then the reload M19's choice also needs. */
function moveToServer(url: string) {
  switchToServer(url)
  window.location.reload()
}

/** One trip as portable YAML, written client-side: there is no server to ask.
 *  Not the NFR-4.11 backup — see the note on `exportReminder`. */
function exportTripYAML() {
  const trip = tripStore.getTrip(yamlTripId.value)
  if (!trip) return
  const yaml = serializeTrip({
    trip,
    items: tripStore.getItems(trip.id),
    travelers: tripStore.getTravelers(trip.id),
    containers: tripStore.getContainers(trip.id),
    includeProgress: true,
    ...masterStore.portableResolvers(),
  })
  saveText(yaml, `${safeFilename(trip.name)}.yaml`)
}

function exportTemplateYAML() {
  const template = masterStore.getTemplate(yamlTemplateId.value)
  if (!template) return
  const yaml = serializeTemplate(
    template,
    masterStore.getTemplateItems(template.id),
    masterStore.portableResolvers().masterItem,
    compositionFrom(template, masterStore.compositionSource()),
    masterStore.portableResolvers().tagsOf,
  )
  saveText(yaml, `${safeFilename(template.name)}.yaml`)
}

/** Storage-detail popover (NFR-4.11): how much of the origin's quota the
 * on-device data uses, and whether the browser has promised not to evict
 * it. Both come from the Storage API; absence is reported honestly. */
async function showStorageDetails() {
  let message = t('settings.storageUnavailable')
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    const persisted = (await navigator.storage.persisted?.()) ?? false
    const mb = (n: number) => formatNumber(n / (1024 * 1024), { maximumFractionDigits: 1 })
    message =
      t('settings.storageUsed', { used: mb(usage), quota: mb(quota) }) +
      '\n\n' +
      t(persisted ? 'settings.storagePersistent' : 'settings.storageNotPersistent')
  }
  const alert = await alertController.create({
    header: t('settings.storageTitle'),
    message,
    buttons: [t('common.ok')],
  })
  await alert.present()
}

async function exportFull() {
  const blob = await orchestrator.downloadExport(API.meExport)
  if (blob) saveBlob(blob, 'jitpack-export.json')
}

async function exportTripCSV() {
  if (!csvTripId.value) return
  const blob = await orchestrator.downloadExport(API.tripExportCSV(csvTripId.value))
  const trip = tripStore.getTrip(csvTripId.value)
  if (blob) saveBlob(blob, `${trip?.name ?? 'trip'}.csv`)
}
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <!-- Profile (FR-17.13) -->
      <h2 class="section-title jp-eyebrow" data-testid="settings-section-profile">
        {{ t('settings.profile') }}
      </h2>
      <template v-if="mode === 'local'">
        <IonNote>{{ t('settings.profileLocalNote') }}</IonNote>
      </template>
      <template v-else-if="me">
        <div class="avatar-row">
          <UserAvatar
            :name="me.display_name || me.user_id"
            :seed="me.user_id"
            :src="avatarUrl"
            :size="64"
          />
          <label v-if="pictureEditable" class="avatar-upload">
            {{ t('settings.changePicture') }}
            <input type="file" accept="image/*" hidden @change="onAvatarFile" />
          </label>
        </div>
        <AvatarCropModal
          :open="cropOpen"
          :file="cropFile"
          @crop="onAvatarCropped"
          @cancel="cropOpen = false"
        />
        <IonList>
          <IonItem>
            <IonInput
              :label="t('settings.displayName')"
              label-placement="stacked"
              data-testid="settings-name-input"
              :value="nameDraft"
              :readonly="!nameEditable"
              :maxlength="50"
              @ionInput="
                (e: CustomEvent) => {
                  nameDraft = e.detail.value ?? ''
                  nameTouched = true
                }
              "
            />
            <IonButton
              v-if="nameEditable"
              slot="end"
              size="small"
              data-testid="settings-name-save"
              :disabled="!nameValid || nameDraft === me.display_name"
              @click="saveName"
            >
              {{ nameSaved ? t('settings.saved') : t('common.save') }}
            </IonButton>
          </IonItem>
        </IonList>
        <IonNote
          v-if="nameEditable && nameTouched && !nameValid"
          color="danger"
          data-testid="settings-name-rule"
        >
          {{ t('settings.nameRule') }}
        </IonNote>
        <IonNote v-else-if="!nameEditable" data-testid="settings-name-managed">
          {{ t('settings.nameManaged') }}
        </IonNote>
      </template>
      <IonNote v-else>{{ t('settings.profileUnavailable') }}</IonNote>

      <!-- Appearance (FR-21.3) — every mode, this device only -->
      <h2 class="section-title jp-eyebrow" data-testid="settings-section-appearance">
        {{ t('settings.appearance') }}
      </h2>
      <IonList>
        <IonItem>
          <IonLabel>
            <h3>{{ t('settings.lightTheme') }}</h3>
            <p>{{ t('settings.lightThemeHint') }}</p>
          </IonLabel>
          <IonToggle
            slot="end"
            data-testid="settings-theme"
            :checked="lightTheme"
            :aria-label="t('settings.lightTheme')"
            @ionChange="(e: CustomEvent) => toggleLightTheme(e.detail.checked)"
          />
        </IonItem>
        <IonItem>
          <IonLabel>
            <h3>{{ t('settings.language') }}</h3>
            <p>{{ t('settings.languageHint') }}</p>
          </IonLabel>
          <IonSelect
            slot="end"
            data-testid="settings-language"
            :value="language"
            interface="popover"
            :aria-label="t('settings.language')"
            @ionChange="(e: CustomEvent) => changeLanguage(e.detail.value)"
          >
            <IonSelectOption value="en">{{ t('settings.languageEnglish') }}</IonSelectOption>
            <IonSelectOption value="de">{{ t('settings.languageGerman') }}</IonSelectOption>
          </IonSelect>
        </IonItem>
      </IonList>

      <!-- Default travelers (FR-2.5a) — every mode, this device only -->
      <h2 class="section-title jp-eyebrow">{{ t('settings.defaultTravelers') }}</h2>
      <p class="section-hint">{{ t('settings.defaultTravelersHint') }}</p>
      <IonList>
        <IonItem v-for="(traveler, index) in travelerNames" :key="`${traveler}-${index}`">
          <IonIcon slot="start" :icon="personOutline" />
          <IonLabel>{{ traveler }}</IonLabel>
          <IonButton
            slot="end"
            fill="clear"
            size="small"
            :data-testid="`default-traveler-remove-${traveler}`"
            :aria-label="t('common.remove')"
            @click="travelers.remove(index)"
          >
            <IonIcon slot="icon-only" :icon="closeOutline" />
          </IonButton>
        </IonItem>
        <!-- Same add-row shape as M22's traveller editor: a placeholder
             input and a labelled button, no stacked label — the scaled
             floating label rendered with glyph gaps mid-word (UX review
             2026-08-25) and its lone + read as detached. -->
        <IonItem lines="none">
          <IonInput
            data-testid="default-traveler-input"
            :aria-label="t('settings.addTraveler')"
            fill="outline"
            :placeholder="t('settings.addTraveler')"
            :value="newTraveler"
            @ionInput="(e: CustomEvent) => (newTraveler = e.detail.value ?? '')"
            @keydown.enter="addTraveler"
          />
          <IonButton
            slot="end"
            data-testid="default-traveler-add"
            :disabled="newTraveler.trim() === ''"
            @click="addTraveler"
          >
            <IonIcon slot="start" :icon="addOutline" />
            {{ t('common.add') }}
          </IonButton>
        </IonItem>
      </IonList>

      <!-- Notifications (FR-6.2 / NFR-4.6) — multi-user only (G-8) -->
      <template v-if="collaborative">
        <h2 class="section-title jp-eyebrow" data-testid="settings-section-notifications">
          {{ t('settings.notifications') }}
        </h2>
        <IonList v-if="prefs">
          <IonItem v-for="p in prefRows" :key="p.kind">
            <IonLabel>
              <h3>{{ t(p.label) }}</h3>
              <p>{{ t(p.hint) }}</p>
            </IonLabel>
            <IonToggle
              slot="end"
              :checked="prefs[p.kind]"
              :aria-label="t(p.label)"
              @ionChange="(e: CustomEvent) => togglePref(p.kind, e.detail.checked)"
            />
          </IonItem>
          <IonItem>
            <IonLabel>
              <h3>{{ t('settings.push') }}</h3>
              <p>
                {{ pushAvailable ? t('settings.pushHint') : t('settings.pushUnsupported') }}
              </p>
            </IonLabel>
            <IonToggle
              slot="end"
              data-testid="settings-push"
              :checked="pushOn"
              :disabled="!pushAvailable"
              :aria-label="t('settings.push')"
              @ionChange="(e: CustomEvent) => togglePush(e.detail.checked)"
            />
          </IonItem>
        </IonList>
        <IonNote v-else>{{ t('settings.notificationsUnavailable') }}</IonNote>
      </template>

      <!-- Data (NFR-4.5) -->
      <h2 class="section-title jp-eyebrow" data-testid="settings-section-data">
        {{ t('settings.data') }}
      </h2>
      <template v-if="mode === 'local'">
        <div
          v-if="exportReminder.due"
          class="export-reminder"
          data-testid="settings-backup-reminder"
        >
          <IonIcon :icon="warningOutline" />
          <span>{{ backupReminderText }}</span>
        </div>
        <IonNote>{{ t('settings.localBackupNote') }}</IonNote>
        <IonList>
          <IonItem>
            <IonSelect
              :label="t('settings.tripYaml')"
              interface="popover"
              :value="yamlTripId"
              @ionChange="(e: CustomEvent) => (yamlTripId = e.detail.value)"
            >
              <IonSelectOption v-for="trip in tripStore.tripList" :key="trip.id" :value="trip.id">
                {{ trip.name }}
              </IonSelectOption>
            </IonSelect>
            <IonButton slot="end" size="small" :disabled="!yamlTripId" @click="exportTripYAML">
              {{ t('common.download') }}
            </IonButton>
          </IonItem>
          <IonItem>
            <IonSelect
              :label="t('settings.templateYaml')"
              interface="popover"
              :value="yamlTemplateId"
              @ionChange="(e: CustomEvent) => (yamlTemplateId = e.detail.value)"
            >
              <IonSelectOption
                v-for="tpl in masterStore.activeTemplateList"
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
              {{ t('common.download') }}
            </IonButton>
          </IonItem>
          <IonItem button :detail="false" @click="showStorageDetails">
            <IonLabel data-testid="settings-storage-details">{{
              t('settings.storageDetails')
            }}</IonLabel>
            <IonNote slot="end">{{ t('settings.storageDetailsHint') }}</IonNote>
          </IonItem>
        </IonList>
        <LeaveLocalModeCard
          :last-backup-at="exportReminder.lastAt"
          :covered="backupCovered"
          :default-url="defaultServerBaseUrl()"
          @backup="backupForMove"
          @switch="moveToServer"
        />
      </template>
      <template v-else>
        <IonList>
          <IonItem button :detail="false" data-testid="settings-full-export" @click="exportFull">
            <IonIcon slot="start" :icon="downloadOutline" />
            <IonLabel>
              <h3>{{ t('settings.fullExport') }}</h3>
              <p>{{ t('settings.fullExportHint') }}</p>
            </IonLabel>
          </IonItem>
          <IonItem>
            <IonSelect
              :label="t('settings.tripCsv')"
              interface="popover"
              :value="csvTripId"
              @ionChange="(e: CustomEvent) => (csvTripId = e.detail.value)"
            >
              <IonSelectOption v-for="trip in tripStore.tripList" :key="trip.id" :value="trip.id">
                {{ trip.name }}
              </IonSelectOption>
            </IonSelect>
            <IonButton slot="end" size="small" :disabled="!csvTripId" @click="exportTripCSV">
              {{ t('common.download') }}
            </IonButton>
          </IonItem>
        </IonList>
      </template>

      <!-- Administration entry (Addendum 3.23, FR-23.2): instance
           admins with an OIDC session only — same gating as M20. -->
      <template v-if="collaborative && me?.is_instance_admin">
        <h2 class="section-title jp-eyebrow" data-testid="settings-section-admin">
          {{ t('settings.administration') }}
        </h2>
        <IonList>
          <IonItem
            button
            lines="none"
            data-testid="settings-admin"
            @click="$router.push(PATH.admin)"
          >
            <IonLabel>
              <h3>{{ t('settings.userAdmin') }}</h3>
              <p>{{ t('settings.userAdminHint') }}</p>
            </IonLabel>
          </IonItem>
        </IonList>
      </template>

      <!-- API tokens (FR-23.7, ADR-039). Gated on `collaborative`, which
           already means "Server Mode with a session": Single-User Mode
           bypasses authentication and Local Mode has no server, so in both
           a token would prove nothing there is anything to prove (G-8). -->
      <template v-if="collaborative">
        <h2 class="section-title jp-eyebrow" data-testid="settings-section-tokens">
          {{ t('settings.apiTokens') }}
        </h2>
        <p class="section-hint">{{ t('settings.apiTokensHint') }}</p>
        <IonList>
          <IonItem lines="none">
            <IonInput
              :label="t('settings.tokenName')"
              label-placement="stacked"
              data-testid="token-name"
              :value="tokenName"
              :placeholder="t('settings.tokenNamePlaceholder')"
              :maxlength="60"
              @ionInput="(e: CustomEvent) => (tokenName = e.detail.value ?? '')"
            />
          </IonItem>
          <IonItem lines="none">
            <IonSelect
              :label="t('settings.tokenExpiry')"
              data-testid="token-expiry"
              interface="popover"
              :value="tokenExpiry"
              @ionChange="(e: CustomEvent) => (tokenExpiry = e.detail.value)"
            >
              <IonSelectOption
                v-for="opt in tokenExpiryOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem lines="none">
            <IonButton
              slot="end"
              size="small"
              data-testid="token-create"
              :disabled="!tokenName.trim() || tokenPending"
              @click="createToken"
            >
              {{ t('settings.tokenCreate') }}
            </IonButton>
          </IonItem>
          <IonItem v-if="tokenFailed" lines="none">
            <IonNote data-testid="token-failed">{{ t('settings.tokenFailed') }}</IonNote>
          </IonItem>
        </IonList>
      </template>

      <!-- M23 (FR-24.3): what a delete only hid, and the way back. Beside
           the conflict log because both are corrective surfaces rather than
           browsing ones, reached after something went wrong. -->
      <h2 class="section-title jp-eyebrow" data-testid="settings-section-retired">
        {{ t('settings.retired') }}
      </h2>
      <IonList>
        <IonItem
          button
          lines="none"
          data-testid="settings-retired"
          @click="$router.push(PATH.masterRetired)"
        >
          <IonLabel>
            <h3>{{ t('settings.retiredRow') }}</h3>
            <p>{{ t('settings.retiredHint') }}</p>
          </IonLabel>
          <IonNote v-if="retiredCount > 0" slot="end" data-testid="settings-retired-count">
            {{ t('settings.retiredCount', { n: retiredCount }) }}
          </IonNote>
        </IonItem>
      </IonList>

      <!-- Conflict log pointer (G-2) -->
      <h2 class="section-title jp-eyebrow" data-testid="settings-section-conflicts">
        {{ t('settings.conflictLog') }}
      </h2>
      <IonNote>{{ t('settings.conflictLogNote') }}</IonNote>

      <!-- App info -->
      <h2 class="section-title jp-eyebrow" data-testid="settings-section-about">
        {{ t('settings.about') }}
      </h2>
      <IonList>
        <IonItem lines="none">
          <IonLabel>
            <h3>JIT-Pack</h3>
            <p>{{ modeText }}</p>
          </IonLabel>
        </IonItem>
      </IonList>

      <ApiTokenSheet
        :open="tokenSheetOpen"
        :token="mintedToken"
        :expires-at="mintedExpiresAt"
        @close="closeTokenSheet"
      />
    </IonContent>
  </IonPage>
</template>

<style scoped>
/*
 * The recessive line under a section heading. It was already used at the
 * default-travelers block and defined nowhere — the class lives scoped inside
 * ItemEditorPage, so on this screen it painted nothing and the hint read as
 * ordinary body copy. Found by looking at the rendered screen; no test could
 * have said it, and no stylesheet reading would have either.
 */
.section-hint {
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
  margin: 0 0 8px;
}

.section-title {
  margin: 20px 0 8px;
}

.export-reminder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border-radius: var(--jp-r-sm);
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-contrast);
  font-size: var(--jp-text-sm);
}

.export-reminder ion-icon {
  flex: none;
  font-size: var(--jp-icon-sm);
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.avatar-upload {
  color: var(--ion-color-primary);
  cursor: pointer;
  font-size: var(--jp-text-base);
}
</style>
