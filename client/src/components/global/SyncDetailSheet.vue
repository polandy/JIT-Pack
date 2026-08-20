<script setup lang="ts">
/**
 * G-2 detail — what the status glyph in the app bar actually means.
 *
 * The glyph is one symbol carrying four situations, and it had no detail at
 * all: tapping it navigated to a trip's conflict log when a trip happened to
 * be open and did nothing anywhere else. UI-Spec G-2 and FR-19.6 always asked
 * for a detail behind it; this is that detail.
 *
 * Two halves, decided by the run mode rather than by the glyph:
 *  * **Server Mode** explains the connection and the queue and leads to the
 *    conflict log (NFR-4.2a), which lives inside a trip.
 *  * **Local Mode** explains that no server exists and leads to a backup —
 *    the portable YAML export is the only copy there is (NFR-4.11). It never
 *    offers the conflict log: a single writer produces no conflicts, so the
 *    entry would describe a mode the user is not in.
 *
 * Every fact is passed in, `now` included, so the sheet is a pure rendering
 * of a moment its test can state exactly.
 */
import { IonIcon } from '@ionic/vue'
import {
  closeOutline,
  downloadOutline,
  listOutline,
  sparklesOutline,
  warningOutline,
} from 'ionicons/icons'
import { computed } from 'vue'

import { SYNC_GLYPHS } from './syncGlyphs'
import { formatNumber, t } from '@/i18n'
import { reminderState } from '@/local/exportReminder'
import { evictionRisk, type StorageStatus } from '@/local/storageStatus'
import { SYNC_EXPLAIN_KEYS, SYNC_LABEL_KEYS, type SyncState } from '@/composables/useSyncStatus'

const props = defineProps<{
  /** The glyph's current state — the sheet titles and explains this one. */
  state: SyncState
  /** Mutations queued but not pushed (Server Mode). */
  pendingCount: number
  /** Run mode: it, not the state, decides which half of the sheet applies. */
  mode: 'local' | 'server'
  /** Whether a trip is open, i.e. whether a conflict log can be reached. */
  canOpenConflicts: boolean
  /** On-device storage facts, or null while they are still being read. */
  storage: StorageStatus | null
  /** Epoch-ms of the last portable export, null when there was never one. */
  lastExportAt: number | null
  /** Whether anything exists that a backup could contain. */
  hasBackupContent: boolean
  /**
   * A newer build is installed and waiting (NFR-4.13). It takes over on the
   * next launch — the sheet announces, it never reloads (ADR-019).
   */
  updateReady: boolean
  /** Injected clock — the backup age is read against this, never Date.now(). */
  now: number
}>()

const emit = defineEmits<{ close: []; conflicts: []; backup: [] }>()

const isLocal = computed(() => props.mode === 'local')

const title = computed(() => t(SYNC_LABEL_KEYS[props.state]))
const explanation = computed(() => t(SYNC_EXPLAIN_KEYS[props.state]))

/** The queue is only a story while something is in it. */
const showPending = computed(() => !isLocal.value && props.pendingCount > 0)

const megabytes = (bytes: number) =>
  formatNumber(bytes / (1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const storageKnown = computed(() => props.storage?.available === true)
const atRisk = computed(() => (props.storage ? evictionRisk(props.storage) : false))

/** Age of the last backup, phrased so "never" is a sentence and not a blank. */
const backupAge = computed(() => {
  const { lastAt, daysSince } = reminderState(props.lastExportAt, props.now)
  if (lastAt === null || daysSince === null) return t('sync.detail.backupNever')
  if (daysSince === 0) return t('sync.detail.backupToday')
  return t('sync.detail.backupAge', { n: daysSince })
})
</script>

<template>
  <section class="sheet-body" data-testid="sync-detail-sheet">
    <header class="head">
      <span class="glyph" :class="state"><IonIcon :icon="SYNC_GLYPHS[state]" /></span>
      <div class="titles">
        <h1 class="jp-sheet-title" data-testid="sync-detail-title">{{ title }}</h1>
        <p class="explain" data-testid="sync-detail-explain">{{ explanation }}</p>
      </div>
      <button
        class="x"
        data-testid="sync-detail-close"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <IonIcon :icon="closeOutline" />
      </button>
    </header>

    <p v-if="showPending" class="line" data-testid="sync-detail-pending">
      {{ t('sync.detail.pending', { n: pendingCount }) }}
    </p>

    <!-- NFR-4.13: a waiting update concerns every mode — the bundle, not the data. -->
    <p v-if="updateReady" class="update" data-testid="sync-detail-update">
      <IonIcon :icon="sparklesOutline" />
      <span>{{ t('sync.detail.updateReady') }}</span>
    </p>

    <!-- Server Mode: the conflict log (NFR-4.2a) is trip-scoped. -->
    <template v-if="!isLocal">
      <button
        v-if="canOpenConflicts"
        class="action"
        data-testid="sync-detail-conflicts"
        @click="emit('conflicts')"
      >
        <IonIcon :icon="listOutline" />
        <span>{{ t('sync.detail.conflicts') }}</span>
      </button>
      <p v-else class="note" data-testid="sync-detail-conflicts-hint">
        {{ t('sync.detail.conflictsHint') }}
      </p>
    </template>

    <!-- Local Mode: storage and backup are the whole safety story (NFR-4.11). -->
    <template v-else>
      <section class="block" data-testid="sync-detail-storage">
        <h2 class="jp-eyebrow">{{ t('sync.detail.storage') }}</h2>
        <template v-if="storageKnown && storage">
          <p class="line jp-num" data-testid="sync-detail-storage-usage">
            {{
              t('sync.detail.storageUsage', {
                used: megabytes(storage.usedBytes),
                quota: megabytes(storage.quotaBytes),
              })
            }}
          </p>
          <p v-if="atRisk" class="warn" data-testid="sync-detail-eviction">
            <IonIcon :icon="warningOutline" />
            <span>{{ t('sync.detail.eviction') }}</span>
          </p>
          <p v-else class="note" data-testid="sync-detail-persistent">
            {{ t('sync.detail.persistent') }}
          </p>
        </template>
        <p v-else class="note" data-testid="sync-detail-storage-unknown">
          {{ t('sync.detail.storageUnknown') }}
        </p>
      </section>

      <section class="block">
        <h2 class="jp-eyebrow">{{ t('sync.detail.backup') }}</h2>
        <p class="line" data-testid="sync-detail-backup-age">{{ backupAge }}</p>
        <template v-if="hasBackupContent">
          <button class="action primary" data-testid="sync-detail-backup" @click="emit('backup')">
            <IonIcon :icon="downloadOutline" />
            <span>{{ t('sync.detail.backupNow') }}</span>
          </button>
          <p class="note">{{ t('sync.detail.backupHint') }}</p>
        </template>
        <p v-else class="note" data-testid="sync-detail-backup-empty">
          {{ t('sync.detail.backupEmpty') }}
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.sheet-body {
  padding: 4px 18px 26px;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 6px;
}

.glyph {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 50%;
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-md);
}

.glyph.synced {
  color: var(--jp-done);
}

.glyph.syncing {
  color: var(--jp-action);
}

.glyph.offline {
  color: var(--ion-color-warning);
}

.titles {
  flex: 1;
  min-width: 0;
}

.explain {
  margin: 4px 0 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.x {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-md);
  cursor: pointer;
}

.block {
  padding-top: 18px;
}

.block h2 {
  margin: 0 0 6px;
  color: var(--ct-subtext0);
}

.line {
  margin: 0;
  padding: 2px 0;
}

.note {
  margin: 6px 0 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.update {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 6px 0 0;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
}

.update ion-icon {
  font-size: var(--jp-icon-sm);
  flex: none;
}

.warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 6px 0 0;
  color: var(--ion-color-warning);
  font-size: var(--jp-text-sm);
}

.action {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 12px;
  padding: 12px 14px;
  border: none;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font-size: var(--jp-text-base);
  text-align: left;
  cursor: pointer;
}

.action.primary {
  background: var(--jp-action);
  color: var(--ct-base);
}

.action ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
