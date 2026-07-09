<script setup lang="ts">
/**
 * G-2 — Conflict Log (NFR-4.2a)
 *
 * Read-only audit of every LWW merge this trip lost a field on:
 * what value lost, what won, and when. Retained until the trip is
 * archived. Reached by tapping the G-2 sync indicator while inside a
 * trip, or directly via /trips/:tripId/conflicts.
 */
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBackButton,
  IonButtons,
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

import type { ConflictEntry, useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ tripId: string }>()

const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const conflicts = ref<ConflictEntry[]>([])
const failed = ref(false)

async function load() {
  try {
    conflicts.value = await orchestrator.fetchConflicts(props.tripId)
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
  return raw === '' ? '—' : raw
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton :default-href="`/trips/${tripId}`" />
        </IonButtons>
        <IonTitle>Conflict log</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent>
      <IonRefresher slot="fixed" @ionRefresh="onRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <IonList v-if="conflicts.length > 0">
        <IonItem v-for="c in conflicts" :key="c.id" lines="inset">
          <IonLabel>
            <h3>{{ c.entity_table }} · {{ c.field }}</h3>
            <p>
              <span class="losing">{{ formatValue(c.losing_value) }}</span>
              →
              <span class="winning">{{ formatValue(c.winning_value) }}</span>
            </p>
            <IonNote>{{ formatTime(c.resolved_at) }}</IonNote>
          </IonLabel>
        </IonItem>
      </IonList>

      <!-- Empty state (G-7) -->
      <div v-else class="empty-state">
        <IonIcon :icon="gitMergeOutline" class="empty-icon" />
        <p v-if="failed">Conflict log unavailable — offline?</p>
        <p v-else>No conflicts — every change merged cleanly</p>
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
  font-weight: 600;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--ion-color-medium);
  margin-top: 48px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}
</style>
