<script setup lang="ts">
/**
 * G-2 — Conflict Log (NFR-4.2a)
 *
 * The audit of every LWW merge that lost a field — what value lost, what
 * won, and when — and the control that takes the loss back. One page, two
 * logs, because there are two sync partitions: with a `tripId` it reads
 * that trip's, without one the master partition's (inventory, groups,
 * series and a trip's own fields, which merge there). The second is
 * reachable from every screen; the first only from inside its trip.
 *
 * A revert is not an undo of the past: the server rewrites the losing
 * value as an ordinary mutation with a fresh HLC (ADR-022), so it can be
 * refused by the same merge rules as any other write. Every refusal is
 * rendered on the row it belongs to rather than as a snackbar — the row
 * is where the reader is looking, and it stays readable.
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonIcon,
  IonButton,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/vue'
import { gitMergeOutline, arrowUndoOutline } from 'ionicons/icons'
import { inject, onMounted, ref } from 'vue'

import { t } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { APIRequestError } from '@/api/client'
import type { ConflictEntry, useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ tripId?: string }>()

const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const conflicts = ref<ConflictEntry[]>([])
const failed = ref(false)

async function load() {
  try {
    conflicts.value = props.tripId
      ? await orchestrator.fetchConflicts(props.tripId)
      : await orchestrator.fetchMasterConflicts()
    failed.value = false
  } catch {
    failed.value = true
  }
}

onMounted(load)

/** Per-entry failure sentence, keyed by conflict id. */
const revertErrors = ref<Record<string, MessageKey>>({})
/** The entry whose revert is in flight, so the control cannot be tapped twice. */
const reverting = ref<string | null>(null)

/**
 * Each refusal the server distinguishes gets its own sentence: which one
 * applies is the only thing the reader needs to decide what to do next.
 */
const REVERT_ERROR_MESSAGES: Record<string, MessageKey> = {
  already_reverted: 'conflicts.revertFailed.alreadyReverted',
  row_deleted: 'conflicts.revertFailed.rowDeleted',
  revert_refused: 'conflicts.revertFailed.refused',
  forbidden: 'conflicts.revertFailed.forbidden',
}

async function revert(entry: ConflictEntry) {
  if (reverting.value !== null) return
  reverting.value = entry.id
  delete revertErrors.value[entry.id]
  try {
    await orchestrator.revertConflict(entry.id, props.tripId)
    // Re-read rather than patch the row: the server owns whether the
    // entry is spent, and the reload also picks up anything that changed
    // while this page was open.
    await load()
  } catch (err) {
    const code = err instanceof APIRequestError ? (err.apiError?.code ?? '') : ''
    revertErrors.value[entry.id] = REVERT_ERROR_MESSAGES[code] ?? 'conflicts.revertFailed.generic'
    // An already-spent entry is stale on screen, not broken: re-reading
    // replaces the button with the reverted note it should have shown.
    if (code === 'already_reverted') await load()
  } finally {
    reverting.value = null
  }
}

async function onRefresh(event: CustomEvent) {
  await load()
  ;(event.target as HTMLIonRefresherElement).complete()
}

function formatValue(raw: string): string {
  return raw === '' ? t('conflicts.emptyValue') : raw
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <IonPage>
    <IonContent>
      <IonRefresher slot="fixed" @ionRefresh="onRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <IonList v-if="conflicts.length > 0">
        <IonItem lines="full">
          <IonNote data-testid="conflict-revert-hint">{{ t('conflicts.revertHint') }}</IonNote>
        </IonItem>
        <IonItem v-for="c in conflicts" :key="c.id" lines="inset" data-testid="conflict-row">
          <IonLabel>
            <h3 data-testid="conflict-field">{{ c.entity_table }} · {{ c.field }}</h3>
            <p>
              <span class="losing" data-testid="conflict-losing">{{
                formatValue(c.losing_value)
              }}</span>
              →
              <span class="winning" data-testid="conflict-winning">{{
                formatValue(c.winning_value)
              }}</span>
            </p>
            <IonNote>{{ formatTime(c.resolved_at) }}</IonNote>
            <p v-if="revertErrors[c.id]" class="revert-error" data-testid="conflict-revert-error">
              {{ t(revertErrors[c.id]!) }}
            </p>
          </IonLabel>

          <IonNote v-if="c.reverted" slot="end" data-testid="conflict-reverted">
            {{ t('conflicts.reverted') }}
          </IonNote>
          <IonButton
            v-else
            slot="end"
            fill="clear"
            :disabled="reverting !== null"
            data-testid="conflict-revert"
            @click="revert(c)"
          >
            <IonIcon slot="start" :icon="arrowUndoOutline" />
            {{ t('conflicts.revert') }}
          </IonButton>
        </IonItem>
      </IonList>

      <!-- Empty state (G-7) -->
      <div v-else class="empty-state" data-testid="conflict-empty">
        <IonIcon :icon="gitMergeOutline" class="empty-icon" />
        <p v-if="failed">{{ t('conflicts.unavailable') }}</p>
        <p v-else>{{ t(props.tripId ? 'conflicts.empty' : 'conflicts.emptyMaster') }}</p>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.losing {
  text-decoration: line-through;
  color: var(--ion-color-medium);
}

.winning {
  font-weight: var(--jp-weight-semibold);
}

.revert-error {
  color: var(--ion-color-danger);
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
