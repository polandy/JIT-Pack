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
  gitMergeOutline,
  listOutline,
  sparklesOutline,
  warningOutline,
} from 'ionicons/icons'
import { computed } from 'vue'

import { SYNC_GLYPHS } from './syncGlyphs'
import { formatNumber, t } from '@/i18n'
import { reminderState } from '@/local/exportReminder'
import { evictionRisk, type StorageStatus } from '@/local/storageStatus'
import { rejectionReasonKey } from '@/sync/rejectionReasons'
import { SYNC_EXPLAIN_KEYS, SYNC_LABEL_KEYS, type SyncState } from '@/composables/useSyncStatus'

const props = withDefaults(
  defineProps<{
    /** The glyph's current state — the sheet titles and explains this one. */
    state: SyncState
    /** Mutations queued but not pushed (Server Mode). */
    pendingCount: number
    /**
     * Whether that queue is being kept on the device (B2, NFR-4.1). False
     * means the browser refused the write — the changes are still going out,
     * but closing the app now would lose them, and only this sheet can say so.
     */
    queueDurable?: boolean
    /** Mutations the server refused for good, parked out of the queue. */
    parkedCount?: number
    /**
     * Why the most recent one was refused (Sync-API §5). A count alone
     * cannot be acted on — the app has usually already removed the row the
     * server kept, and this is the only place that says why.
     */
    parkedReason?: string | null
    /**
     * Fields of this device's changes the server merged away this session
     * (NFR-4.2a). The durable record is the conflict log; this is the
     * awareness, and without it a `merged` push was silent.
     */
    conflictCount?: number
    /** Run mode: it, not the state, decides which half of the sheet applies. */
    mode: 'local' | 'server'
    /** Whether a trip is open, i.e. whether its own conflict log exists. */
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
  }>(),
  // Durability is assumed until the outbox reports it lost — a device that
  // never had a queue to keep has not failed to keep one.
  { queueDurable: true, parkedCount: 0, conflictCount: 0 },
)

const emit = defineEmits<{ close: []; conflicts: []; masterConflicts: []; backup: [] }>()

const isLocal = computed(() => props.mode === 'local')

const title = computed(() => t(SYNC_LABEL_KEYS[props.state]))
const explanation = computed(() => t(SYNC_EXPLAIN_KEYS[props.state]))

/** The queue is only a story while something is in it. */
const showPending = computed(() => !isLocal.value && props.pendingCount > 0)

/**
 * A refusal is Server Mode's story too: Local Mode has no server to refuse
 * anything, so the line would describe a mode the user is not in.
 */
const showParked = computed(() => !isLocal.value && (props.parkedCount ?? 0) > 0)

/**
 * The refusal in words, or null when the server sent something this build
 * has no sentence for — raw server text is a diagnostic, not screen copy.
 */
const parkedReasonText = computed(() => {
  const key = rejectionReasonKey(props.parkedReason)
  return key === null ? null : t(key)
})
const showConflicted = computed(() => !isLocal.value && (props.conflictCount ?? 0) > 0)

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
      <div class="head-line">
        <span class="glyph" :class="state" data-testid="sync-detail-glyph"
          ><IonIcon :icon="SYNC_GLYPHS[state]"
        /></span>
        <h1 class="jp-sheet-title" data-testid="sync-detail-title">{{ title }}</h1>
        <button
          class="x"
          data-testid="sync-detail-close"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <IonIcon :icon="closeOutline" />
        </button>
      </div>
      <p class="explain" data-testid="sync-detail-explain">{{ explanation }}</p>
    </header>

    <template v-if="showPending">
      <p class="line" data-testid="sync-detail-pending">
        {{ t('sync.detail.pending', { n: pendingCount }) }}
      </p>
      <p v-if="queueDurable" class="note" data-testid="sync-detail-pending-durable">
        {{ t('sync.detail.pendingDurable') }}
      </p>
      <p v-else class="warn" data-testid="sync-detail-pending-fragile">
        <IonIcon :icon="warningOutline" />
        <span>{{ t('sync.detail.pendingFragile') }}</span>
      </p>
    </template>

    <!-- B2: a change the server refused is out of the queue on purpose —
         keeping it would take everything behind it hostage. -->
    <template v-if="showParked">
      <p class="warn" data-testid="sync-detail-parked">
        <IonIcon :icon="warningOutline" />
        <span>{{ t('sync.detail.parked', { n: parkedCount ?? 0 }) }}</span>
      </p>
      <p v-if="parkedReasonText" class="note" data-testid="sync-detail-parked-reason">
        {{ parkedReasonText }}
      </p>
      <p class="note" data-testid="sync-detail-parked-hint">
        {{ t('sync.detail.parkedHint') }}
      </p>
    </template>

    <!-- NFR-4.2a: a `merged` push applied, and quietly dropped fields on the
         way. The log holds the detail; this is the only place that says it
         happened at all to someone who was not looking when it did. -->
    <p v-if="showConflicted" class="note" data-testid="sync-detail-conflicted">
      <IonIcon :icon="gitMergeOutline" />
      <span>{{ t('sync.detail.conflicted', { n: conflictCount ?? 0 }) }}</span>
    </p>

    <!-- NFR-4.13: a waiting update concerns every mode — the bundle, not the data. -->
    <p v-if="updateReady" class="update" data-testid="sync-detail-update">
      <IonIcon :icon="sparklesOutline" />
      <span>{{ t('sync.detail.updateReady') }}</span>
    </p>

    <!--
      Server Mode: one conflict log per sync partition (NFR-4.2a). The
      trip's is offered only while one is open; the master partition's
      always, because it belongs to no trip and was reachable through
      nothing while the sheet only knew about the trip-scoped one.
    -->
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
      <button
        class="action"
        data-testid="sync-detail-master-conflicts"
        @click="emit('masterConflicts')"
      >
        <IonIcon :icon="listOutline" />
        <span>{{ t('sync.detail.conflictsMaster') }}</span>
      </button>
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

/*
 * The state glyph belongs to the *title*, so the two share a row and centre
 * against each other. Aligning the circle to the top of a block that also
 * held the explanation is what put it half a line high: the h1 inside carried
 * a 20px margin nothing asked for — `.jp-sheet-title` names a type role and
 * no spacing — so the text began well below the box the circle aligned to.
 * Centring on the line has nothing to re-tune when the display face or the
 * title size changes (E2E-G2-08).
 */
.head {
  display: flex;
  flex-direction: column;
  padding-bottom: 6px;

  /* Named once: the explanation's indent below is derived from them. */
  --head-glyph-size: 38px;
  --head-gap: 12px;
}

.head-line {
  display: flex;
  align-items: center;
  gap: var(--head-gap);
}

.head-line h1 {
  flex: 1;
  min-width: 0;
  margin: 0;
}

.glyph {
  display: grid;
  place-items: center;
  width: var(--head-glyph-size);
  height: var(--head-glyph-size);
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

.explain {
  /* Indented to the title's edge, so the header still reads as one block. */
  margin: 4px 0 0;
  padding-left: calc(var(--head-glyph-size) + var(--head-gap));
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
