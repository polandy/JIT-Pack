<script setup lang="ts">
/**
 * M18 — Portable Import Preview (FR-18.4/18.5).
 *
 * Single-screen confirmation for a portable YAML template or trip file —
 * deliberately not a wizard: the format is our own, no mapping needed.
 * Malformed files never reach the preview (inline error at the picker);
 * a newer schema_version shows a warning but imports best-effort.
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
  IonList,
  IonItem,
  IonLabel,
  IonChip,
  IonTextarea,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonIcon,
} from '@ionic/vue'
import { documentTextOutline, warningOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'

import { matchPortableItems, parsePortable, type ParseResult } from '@/domain/portable'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const router = useRouter()
const master = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const rawText = ref('')
const parsed = ref<ParseResult | null>(null)

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  rawText.value = await file.text()
  preview()
}

function preview() {
  parsed.value = parsePortable(rawText.value)
  const choices = new Map<string, boolean>()
  for (const match of matches.value) {
    if (match.state !== 'new') choices.set(match.name, true)
  }
  mergeChoices.value = choices
}

const doc = computed(() => parsed.value?.doc ?? null)
const matches = computed(() => (doc.value ? matchPortableItems(doc.value, master.itemList) : []))

/** Near-duplicates offer merge/keep-separate; exact matches default to merge. */
const mergeChoices = ref<Map<string, boolean>>(new Map())

function setMerge(name: string, merge: boolean) {
  const next = new Map(mergeChoices.value)
  next.set(name, merge)
  mergeChoices.value = next
}

function commit() {
  if (!doc.value) return
  const decisions = new Map<string, string>()
  for (const match of matches.value) {
    if (match.existingId && mergeChoices.value.get(match.name)) {
      decisions.set(match.name, match.existingId)
    }
  }
  const result = orchestrator.commitPortableImport(doc.value, decisions)
  router.replace(result.kind === 'template' ? `/templates/${result.id}` : `/trips/${result.id}`)
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton default-href="/tabs/trips" />
        </IonButtons>
        <IonTitle>Import file</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <!-- File picker / paste -->
      <template v-if="!doc">
        <h2 class="section-title">Portable YAML file</h2>
        <p class="hint">A template or trip exported from any JIT-Pack instance (FR-18.1).</p>
        <input type="file" accept=".yaml,.yml,text/yaml" @change="onFile" />
        <IonTextarea
          class="paste-area"
          placeholder="…or paste YAML here"
          :value="rawText"
          :rows="8"
          @ionInput="(e: CustomEvent) => (rawText = e.detail.value ?? '')"
        />
        <!-- Malformed files are rejected here, before any preview -->
        <IonNote v-if="parsed?.error" color="danger">{{ parsed.error }}</IonNote>
        <IonButton expand="block" :disabled="rawText.trim() === ''" @click="preview">
          Preview
        </IonButton>
      </template>

      <!-- Preview (single screen, no wizard) -->
      <template v-else>
        <div class="summary">
          <IonIcon :icon="documentTextOutline" class="summary-icon" />
          <div>
            <h2 class="summary-name">{{ doc.name }}</h2>
            <p class="summary-meta">
              {{ doc.kind === 'template' ? 'Template' : 'Trip' }} · {{ doc.items.length }} item{{
                doc.items.length === 1 ? '' : 's'
              }}
              · schema v{{ doc.schema_version }}
            </p>
          </div>
        </div>
        <IonNote v-if="parsed?.newerSchema" class="schema-warning">
          <IonIcon :icon="warningOutline" />
          This file was written by a newer app version — unknown fields will be ignored (FR-18.5).
        </IonNote>

        <IonList>
          <IonItem v-for="match in matches" :key="match.name">
            <IonLabel>
              <h3>{{ match.name }}</h3>
              <p v-if="match.state === 'near'">similar to: {{ match.existingName }}</p>
            </IonLabel>
            <IonChip
              v-if="match.state !== 'near'"
              slot="end"
              :color="match.state === 'new' ? 'primary' : 'success'"
              outline
            >
              {{ match.state === 'new' ? 'new' : 'matched' }}
            </IonChip>
            <IonSegment
              v-else
              slot="end"
              class="merge-segment"
              :value="mergeChoices.get(match.name) ? 'merge' : 'separate'"
              @ionChange="(e: CustomEvent) => setMerge(match.name, e.detail.value === 'merge')"
            >
              <IonSegmentButton value="merge"><IonLabel>Merge</IonLabel></IonSegmentButton>
              <IonSegmentButton value="separate"
                ><IonLabel>Keep separate</IonLabel></IonSegmentButton
              >
            </IonSegment>
          </IonItem>
        </IonList>

        <div class="actions">
          <IonButton fill="outline" @click="parsed = null">Cancel</IonButton>
          <IonButton color="primary" @click="commit">
            Import {{ doc.kind === 'template' ? 'template' : 'trip' }}
          </IonButton>
        </div>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 16px 0 8px;
}

.hint {
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}

.paste-area {
  margin: 12px 0;
  border: 1px solid var(--ion-color-light-shade, #d7d8da);
  border-radius: 8px;
  padding: 4px 8px;
}

.summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.summary-icon {
  font-size: 36px;
  color: var(--ion-color-primary);
}

.summary-name {
  font-size: 1.2rem;
  font-weight: 700;
  margin: 0;
}

.summary-meta {
  margin: 2px 0 0;
  color: var(--ion-color-medium);
}

.schema-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0;
}

.merge-segment {
  max-width: 240px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
</style>
