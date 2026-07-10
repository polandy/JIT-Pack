<script setup lang="ts">
/**
 * M14 — Post-Trip Review Assistant (FR-9.2).
 *
 * Card stack over the proposals derived from the trip's FR-9.1 flags.
 * Apply writes to the user's own templates as ordinary master
 * mutations; foreign published templates are forked first (FR-1.6).
 * Proposals are recomputed from current state, so the assistant is
 * naturally resumable — applied cards simply stop appearing.
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
  IonCard,
  IonCardContent,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
} from '@ionic/vue'
import { checkmarkCircleOutline, gitBranchOutline, sparklesOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import { buildReviewProposals, type ReviewProposal } from '@/domain/review'
import { dismissProposal, isDismissed } from '@/local/reviewDismissals'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ tripId: string }>()

const store = useTripStore()
const master = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const trip = computed(() => store.getTrip(props.tripId))

/** Session-only skips ("ask me next time"). */
const skipped = ref<Set<string>>(new Set())
/** Bumped after "Never ask again" so proposals recompute. */
const dismissedVersion = ref(0)
const applied = ref<string[]>([])

/**
 * Flag occurrences across the archived trips of the series synced to
 * this device (same honesty caveat as M12), including this trip.
 */
function historyCount(itemName: string, flag: 'unused' | 'missing'): number {
  const seriesId = trip.value?.series_id
  if (!seriesId) return 1
  const name = itemName.toLowerCase()
  const hits = store.tripList.filter(
    (t) =>
      t.id !== props.tripId &&
      t.series_id === seriesId &&
      t.status === 'archived' &&
      store
        .getItems(t.id)
        .some(
          (i) =>
            i.name.toLowerCase() === name && (flag === 'unused' ? i.flag_unused : i.flag_missing),
        ),
  ).length
  return 1 + hits
}

const proposals = computed(() => {
  void dismissedVersion.value
  return buildReviewProposals({
    items: store.getItems(props.tripId),
    templates: master.templateList,
    templateItems: (id) => master.getTemplateItems(id),
    masterItems: master.itemList,
    isDismissed,
    flaggedTripCount: historyCount,
  }).filter((p) => !skipped.value.has(p.key))
})

const current = computed<ReviewProposal | null>(() => proposals.value[0] ?? null)

function cardText(p: ReviewProposal): string {
  const flagged =
    p.flagCount > 1
      ? `was flagged ${p.kind === 'reduce_quantity' ? 'Unused' : 'Missing'} on ${p.flagCount} trips`
      : `was flagged ${p.kind === 'reduce_quantity' ? 'Unused' : 'Missing'}`
  return p.kind === 'reduce_quantity'
    ? `'${p.itemName}' ${flagged} — set its quantity to 0 in template '${p.templateName}'?`
    : `'${p.itemName}' ${flagged} — permanently add it to template '${p.templateName}'?`
}

function apply(p: ReviewProposal) {
  orchestrator.applyReviewProposal(p, { fork: p.requiresFork })
  const action =
    p.kind === 'reduce_quantity'
      ? `Set '${p.itemName}' to 0 in '${p.templateName}'`
      : `Added '${p.itemName}' to '${p.templateName}'`
  applied.value = [...applied.value, p.requiresFork ? `${action} (forked copy)` : action]
}

function skip(p: ReviewProposal) {
  skipped.value = new Set([...skipped.value, p.key])
}

function neverAskAgain(p: ReviewProposal) {
  dismissProposal(p.key)
  dismissedVersion.value++
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton :default-href="`/trips/${tripId}`" />
        </IonButtons>
        <IonTitle>Review · {{ trip?.name ?? '' }}</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <!-- Proposal card stack -->
      <template v-if="current">
        <IonNote
          >{{ proposals.length }} proposal{{ proposals.length === 1 ? '' : 's' }} to review</IonNote
        >
        <IonCard class="proposal-card">
          <IonCardContent>
            <IonIcon :icon="sparklesOutline" class="card-icon" />
            <p class="card-text">{{ cardText(current) }}</p>
            <p v-if="current.requiresFork" class="fork-note">
              <IonIcon :icon="gitBranchOutline" />
              This template is published by someone else — applying creates your own copy (FR-1.6).
            </p>
            <div class="card-actions">
              <IonButton expand="block" @click="apply(current)">
                {{ current.requiresFork ? 'Fork & apply' : 'Apply' }}
              </IonButton>
              <IonButton expand="block" fill="outline" @click="skip(current)">Skip</IonButton>
              <IonButton expand="block" fill="clear" color="medium" @click="neverAskAgain(current)">
                Never ask again
              </IonButton>
            </div>
          </IonCardContent>
        </IonCard>
      </template>

      <!-- Done: summary of applied changes, or nothing-to-review state -->
      <template v-else>
        <div class="done">
          <IonIcon :icon="checkmarkCircleOutline" color="success" class="done-icon" />
          <h2 v-if="applied.length > 0">Templates updated</h2>
          <h2 v-else>Nothing to review</h2>
          <p v-if="applied.length === 0">
            No flags on this trip — your templates are already in shape.
          </p>
        </div>
        <IonList v-if="applied.length > 0">
          <IonItem v-for="(entry, i) in applied" :key="i" lines="inset">
            <IonLabel>{{ entry }}</IonLabel>
          </IonItem>
        </IonList>
        <IonButton
          expand="block"
          class="done-button"
          :router-link="`/trips/${tripId}`"
          router-direction="back"
        >
          Done
        </IonButton>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.proposal-card {
  margin-top: 12px;
}

.card-icon {
  font-size: 28px;
  color: var(--ion-color-primary);
}

.card-text {
  font-size: 1.05rem;
  margin: 8px 0 4px;
}

.fork-note {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ion-color-medium);
  font-size: 0.85rem;
}

.card-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.done {
  text-align: center;
  margin-top: 32px;
}

.done-icon {
  font-size: 48px;
}

.done-button {
  margin-top: 24px;
}
</style>
