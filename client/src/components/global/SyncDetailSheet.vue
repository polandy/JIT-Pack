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
  downloadOutline,
  flashOutline,
  gitMergeOutline,
  listOutline,
  peopleOutline,
  refreshOutline,
  sparklesOutline,
  warningOutline,
} from 'ionicons/icons'
import { computed } from 'vue'

import { SYNC_GLYPHS } from './syncGlyphs'
import type { RequestFailure } from '@/api/client'
import { currentLocale, formatNumber, t } from '@/i18n'
import { reminderState } from '@/local/exportReminder'
import { evictionRisk, type StorageStatus } from '@/local/storageStatus'
import { rejectionReasonKey } from '@/sync/rejectionReasons'
import { SYNC_EXPLAIN_KEYS, SYNC_LABEL_KEYS, type SyncState } from '@/composables/useSyncStatus'
import SectionHead from '@/components/global/SectionHead.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import type { OnlineRow } from '@/lib/onlineRows'

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
    /**
     * Whether the WebSocket is open (Sync-API §7). Server Mode only: the
     * glyph's state is about this device's own changes reaching the server,
     * and says nothing about other devices' changes reaching this one — a
     * dead socket under a green glyph was a deaf device that looked fine.
     */
    live?: boolean
    /**
     * The last request that failed, or null while none has (FR-19.6). Server
     * Mode only — Local Mode sends none. The glyph cannot say *why* it is
     * offline, and this is the line that can.
     */
    lastFailure?: RequestFailure | null
    /**
     * Epoch-ms of the last completed sync cycle, null while none has this
     * session (FR-19.6). Server Mode only — Local Mode never syncs.
     */
    lastSyncedAt?: number | null
    /**
     * Who else has a shared trip open right now (FR-4.9), or `null` where
     * there is nobody to be told about — Local and Single-User Mode. `null`
     * and an empty list differ on purpose: the second is an answer.
     */
    online?: OnlineRow[] | null
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
     * next launch (ADR-019) — and, since FR-19.7, on a press of the action
     * below, which is the only thing that shortens the wait (ADR-044).
     */
    updateReady: boolean
    /** True from the press until the page is replaced — no second press. */
    updateApplying?: boolean
    /** Injected clock — the backup age is read against this, never Date.now(). */
    now: number
  }>(),
  // Durability is assumed until the outbox reports it lost — a device that
  // never had a queue to keep has not failed to keep one.
  {
    queueDurable: true,
    parkedCount: 0,
    conflictCount: 0,
    live: false,
    updateApplying: false,
    lastFailure: null,
    lastSyncedAt: null,
    online: null,
  },
)

const emit = defineEmits<{
  close: []
  conflicts: []
  masterConflicts: []
  backup: []
  /** FR-19.7: apply the waiting version now. */
  applyUpdate: []
  /** FR-4.9: go to the trip somebody else is packing. */
  openTrip: [tripId: string]
}>()

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

/**
 * The failed request in one sentence. Status, method and path stay as the
 * transport wrote them — a technical diagnostic is not screen copy and is not
 * translated (NFR-4.12's rule for error detail); only the sentence around it
 * is. The time is the device's, formatted in the reader's locale.
 */
const lastFailureText = computed(() => {
  const failure = props.lastFailure
  if (!failure || isLocal.value) return null
  const when = new Date(failure.at).toLocaleTimeString(currentLocale())
  const { method, path, status } = failure
  return status === null
    ? t('sync.detail.lastFailureUnreachable', { when, method, path })
    : t('sync.detail.lastFailure', { when, status, method, path })
})

/**
 * When the device last completed a sync. A time of day alone would read as
 * "today" for a device that has been offline for days, so any other day
 * carries its date — judged against the injected `now`, never the clock.
 */
const lastSyncedText = computed(() => {
  const at = props.lastSyncedAt
  if (at == null || isLocal.value) return null
  const sameDay = new Date(at).toDateString() === new Date(props.now).toDateString()
  const when = sameDay
    ? new Date(at).toLocaleTimeString(currentLocale(), { timeStyle: 'short' })
    : new Date(at).toLocaleString(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' })
  return t('sync.detail.lastSynced', { when })
})

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
    <SheetHead
      :title="title"
      :meta="explanation"
      title-testid="sync-detail-title"
      close-testid="sync-detail-close"
      @close="emit('close')"
    >
      <template #lead>
        <span class="glyph" :class="state" data-testid="sync-detail-glyph"
          ><IonIcon :icon="SYNC_GLYPHS[state]"
        /></span>
      </template>
      <template #meta>
        <span data-testid="sync-detail-explain">{{ explanation }}</span>
      </template>
    </SheetHead>

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

    <!-- FR-19.6: since when "synced" is true. Absent until a cycle has
         completed this session — the sheet must not vouch for a connection
         this page has not made. -->
    <p v-if="lastSyncedText" class="note" data-testid="sync-detail-last-synced">
      {{ lastSyncedText }}
    </p>

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

    <!-- Sync-API §7/§9: whether *other* devices' changes are reaching this
         one right now. Both lines render on purpose — an absence needs a
         positive signal to be asserted against. -->
    <p v-if="!isLocal && live" class="note" data-testid="sync-detail-live">
      <IonIcon :icon="flashOutline" />
      <span>{{ t('sync.detail.live') }}</span>
    </p>
    <p v-else-if="!isLocal" class="warn" data-testid="sync-detail-live-gap">
      <IonIcon :icon="warningOutline" />
      <span>{{ t('sync.detail.liveGap') }}</span>
    </p>

    <!-- FR-4.9: who else is at work on a trip this account shares. An empty
         list is an answer and says so, so the sheet never looks unfinished. -->
    <section v-if="!isLocal && online" class="block" data-testid="sync-detail-online">
      <SectionHead :title="t('sync.detail.online')" :count="online.length || null" />
      <p v-if="online.length === 0" class="note" data-testid="sync-detail-online-nobody">
        {{ t('sync.detail.onlineNobody') }}
      </p>
      <button
        v-for="row in online"
        :key="row.key"
        class="action"
        :data-testid="`sync-detail-online-${row.name}`"
        @click="emit('openTrip', row.tripId)"
      >
        <IonIcon :icon="peopleOutline" />
        <span class="who"
          ><strong>{{ row.name }}</strong
          ><small>{{ row.tripName }}</small></span
        >
      </button>
    </section>

    <!--
      FR-19.6: why the glyph says what it says. Four situations share one
      symbol, and before this line a 401, a 500 and a dead radio were the
      same offline dot — unreportable by the person holding the device and
      unreachable for the maintainer, whose instance keeps no request log.
      It survives a later success on purpose: a background drain that failed
      under a green glyph is the case nobody was watching.
    -->
    <template v-if="lastFailureText">
      <p class="warn" data-testid="sync-detail-last-failure">
        <IonIcon :icon="warningOutline" />
        <span class="diagnostic">{{ lastFailureText }}</span>
      </p>
      <p class="note" data-testid="sync-detail-last-failure-hint">
        {{ t('sync.detail.lastFailureHint') }}
      </p>
    </template>

    <!-- NFR-4.13: a waiting update concerns every mode — the bundle, not the data. -->
    <template v-if="updateReady">
      <p class="update" data-testid="sync-detail-update">
        <IonIcon :icon="sparklesOutline" />
        <span>{{ t('sync.detail.updateReady') }}</span>
      </p>
      <!-- FR-19.7: the sentence stopped being the whole answer. -->
      <button
        class="action primary"
        data-testid="sync-detail-update-apply"
        :disabled="updateApplying"
        @click="emit('applyUpdate')"
      >
        <IonIcon :icon="refreshOutline" />
        <span>{{ updateApplying ? t('update.applying') : t('update.applyLong') }}</span>
      </button>
    </template>

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
        <SectionHead :title="t('sync.detail.storage')" />
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
        <SectionHead :title="t('sync.detail.backup')" />
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

.diagnostic {
  /* A path breaks where it must: the line is read out or copied, never wrapped
     by hand. */
  overflow-wrap: anywhere;
}

.warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 6px 0 0;
  color: var(--ion-color-warning);
  font-size: var(--jp-text-sm);
}

.who {
  display: grid;
}

.who small {
  color: var(--ct-subtext0);
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

.action:disabled {
  cursor: default;
  opacity: 0.6;
}

.action ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
