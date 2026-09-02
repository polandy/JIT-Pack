<script setup lang="ts">
/**
 * FR-19.8 — the three-step move off Local Mode (UI-Spec M17, ADR-045).
 *
 * Back up, point the app at a server, restore. The card owns none of the
 * three: the backup is the FR-19.6 export, the switch is `mode.ts`'s, and
 * the restore happens after the reload on a screen that is not this one.
 * What it owns is the *guard* being visible — the switch is disabled while
 * the backup is older than the last change, and the disabled state says so
 * in words, because a grey button with an unnamed reason is the FR-25.15
 * shape. Purely presentational so the guard can be stated as a prop.
 */
import { IonButton, IonIcon, IonInput, IonNote } from '@ionic/vue'
import {
  cloudUploadOutline,
  downloadOutline,
  swapHorizontalOutline,
  warningOutline,
} from 'ionicons/icons'
import { computed, ref } from 'vue'

import { currentLocale, t } from '@/i18n'
import { isValidServerUrl } from '@/mode'

const props = defineProps<{
  /** Epoch-ms of the last whole-device backup, or null when never taken. */
  lastBackupAt: number | null
  /** True while that backup is newer than the last change on this device. */
  covered: boolean
  /** The URL the field opens with — the page's own origin (M19's reason). */
  defaultUrl: string
}>()

const emit = defineEmits<{
  /** Take the whole-device backup (step 1). */
  backup: []
  /** Switch to the server at this URL (step 2). */
  switch: [url: string]
}>()

const serverUrl = ref(props.defaultUrl)
const urlValid = computed(() => isValidServerUrl(serverUrl.value))
const canSwitch = computed(() => props.covered && urlValid.value)

const lastBackupText = computed(() =>
  props.lastBackupAt === null
    ? t('settings.move.backupNever')
    : t('settings.move.backupLast', {
        when: new Date(props.lastBackupAt).toLocaleString(currentLocale()),
      }),
)
</script>

<template>
  <section class="move-card jp-card" data-testid="settings-move-card">
    <h3 class="title">
      <IonIcon :icon="cloudUploadOutline" />
      <span>{{ t('settings.move.title') }}</span>
    </h3>
    <p class="intro">{{ t('settings.move.intro') }}</p>

    <ol class="steps">
      <li>
        <div class="step-head">{{ t('settings.move.step1') }}</div>
        <div class="step-row">
          <span class="note" data-testid="settings-move-last-backup">{{ lastBackupText }}</span>
          <IonButton size="small" data-testid="settings-move-backup" @click="emit('backup')">
            <IonIcon slot="start" :icon="downloadOutline" />
            {{ t('settings.move.backupAction') }}
          </IonButton>
        </div>
      </li>
      <li>
        <div class="step-head">{{ t('settings.move.step2') }}</div>
        <IonInput
          :label="t('settings.move.serverUrl')"
          label-placement="stacked"
          type="url"
          inputmode="url"
          :value="serverUrl"
          data-testid="settings-move-url"
          @ionInput="(e: CustomEvent) => (serverUrl = String(e.detail.value ?? ''))"
        />
        <IonNote v-if="serverUrl && !urlValid" color="danger" class="note">
          {{ t('firstRun.serverUrlInvalid') }}
        </IonNote>
        <!-- FR-19.8: the guard is a sentence, not only a grey button. -->
        <div v-if="!covered" class="guard" data-testid="settings-move-guard">
          <IonIcon :icon="warningOutline" />
          <span>{{ t('settings.move.guard') }}</span>
        </div>
        <IonButton
          size="small"
          :disabled="!canSwitch"
          data-testid="settings-move-switch"
          @click="emit('switch', serverUrl)"
        >
          <IonIcon slot="start" :icon="swapHorizontalOutline" />
          {{ t('settings.move.switchAction') }}
        </IonButton>
      </li>
      <li>
        <div class="step-head">{{ t('settings.move.step3') }}</div>
        <span class="note">{{ t('settings.move.step3Body') }}</span>
      </li>
    </ol>

    <p class="note">{{ t('settings.move.secondCopy') }}</p>
  </section>
</template>

<style scoped>
.move-card {
  margin: 12px 0 8px;
  padding: 12px 14px;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}

.title ion-icon {
  flex: none;
  color: var(--jp-action);
  font-size: var(--jp-icon-sm);
}

.intro {
  margin: 0 0 10px;
  font-size: var(--jp-text-sm);
}

.steps {
  margin: 0;
  padding-left: 20px;
}

.steps li + li {
  margin-top: 12px;
}

.step-head {
  font-weight: var(--jp-weight-semibold);
  font-size: var(--jp-text-sm);
}

.step-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.note {
  display: block;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
}

p.note {
  margin: 12px 0 0;
}

/* The same shape as M17's backup reminder: the reason the button is grey. */
.guard {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: var(--jp-r-sm);
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-contrast);
  font-size: var(--jp-text-xs);
}

.guard ion-icon {
  flex: none;
  font-size: var(--jp-icon-sm);
}
</style>
