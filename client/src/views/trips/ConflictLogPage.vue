<script setup lang="ts">
/**
 * G-2 — Conflict Log (NFR-4.2a)
 *
 * Read-only audit of every LWW merge that lost a field: what value lost,
 * what won, and when. One page, two logs, because there are two sync
 * partitions — with a `tripId` it reads that trip's, without one the
 * master partition's (inventory, groups, series and a trip's own fields,
 * which merge there). The second is reachable from every screen; the
 * first only from inside its trip.
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/vue'
import { gitMergeOutline } from 'ionicons/icons'
import { inject, onMounted, ref } from 'vue'

import { t } from '@/i18n'
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
          </IonLabel>
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
