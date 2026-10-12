<script setup lang="ts">
/**
 * M17's Data section (NFR-4.5). Server Mode: the full JSON export and a
 * trip's CSV. Local Mode: the portable YAML path instead (NFR-4.11) — one
 * trip, one template, the storage detail, the backup reminder and FR-19.8's
 * way off the device.
 *
 * The page calls `refreshReminder` on every entry (`defineExpose`): Ionic's
 * view hooks reach the page, not a component inside it.
 */
import { API } from '@/api/routes'
import {
  IonButton,
  IonList,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonNote,
  IonIcon,
  alertController,
} from '@ionic/vue'
import { downloadOutline, warningOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'
import {
  EXPORT_REMINDER_DAYS,
  backupCoversDevice,
  lastExportAt,
  lastLocalWriteAt,
  reminderState,
} from '@/local/exportReminder'
import { readMode, switchToServer } from '@/mode'
import { defaultServerBaseUrl } from '@/config'
import { compositionFrom, serializeTemplate } from '@/domain/portable'
import { safeFilename, saveBlob, saveText } from '@/lib/download'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { formatNumber, t } from '@/i18n'
import LeaveLocalModeCard from '@/components/settings/LeaveLocalModeCard.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import { useDeviceBackup } from '@/composables/useDeviceBackup'
import { useTripExport } from '@/composables/useTripExport'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'

const orchestrator = useOrchestrator()
const tripStore = useTripStore()
const masterStore = useMasterStore()
const { exportTripYaml } = useTripExport()

const mode = readMode()

const csvTripId = ref('')
const yamlTripId = ref('')
const yamlTemplateId = ref('')

/*
 * NFR-4.11 export reminder. What it tracks is the **whole-device** backup —
 * the requirement's own words — which is the G-2 storage sheet's one-tap
 * export and nothing else. The two YAML downloads below are a single trip
 * and a single template, and they do not stamp this key: exporting one trip
 * must not silence the warning about everything the file does not contain.
 */
const exportReminder = ref(reminderState(lastExportAt(), orchestrator.now()))

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

/**
 * The guard on FR-19.8's switch: re-read with the reminder, because the last
 * write is stamped by the orchestrator from whatever screen made it.
 */
const backupCovered = ref(backupCoversDevice(lastExportAt(), lastLocalWriteAt()))

/**
 * Re-read the stamp whenever the screen is entered. The backup that clears
 * this warning is taken on the G-2 sheet — another component — so a value
 * captured once at setup would go on warning for the rest of the session
 * about a backup the user has just made. Ionic keeps the page mounted,
 * which is exactly why entering has to be the trigger rather than mounting.
 */
function refreshReminder() {
  exportReminder.value = reminderState(lastExportAt(), orchestrator.now())
  backupCovered.value = backupCoversDevice(lastExportAt(), lastLocalWriteAt())
}

defineExpose({ refreshReminder })

// --- FR-19.8: leaving Local Mode (ADR-045) ---

const { saveBackup: writeDeviceBackup } = useDeviceBackup()

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
  exportTripYaml(yamlTripId.value, { includeProgress: true })
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
  const blob = await orchestrator.identity.downloadExport(API.meExport)
  if (blob) saveBlob(blob, 'jitpack-export.json')
}

async function exportTripCSV() {
  if (!csvTripId.value) return
  const blob = await orchestrator.identity.downloadExport(API.tripExportCSV(csvTripId.value))
  const trip = tripStore.getTrip(csvTripId.value)
  if (blob) saveBlob(blob, `${trip?.name ?? 'trip'}.csv`)
}
</script>

<template>
  <SectionHead :title="t('settings.data')" data-testid="settings-section-data" />
  <template v-if="mode === 'local'">
    <div v-if="exportReminder.due" class="export-reminder" data-testid="settings-backup-reminder">
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
        <IonButton slot="end" size="small" :disabled="!yamlTemplateId" @click="exportTemplateYAML">
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
</template>

<style scoped>
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
</style>
