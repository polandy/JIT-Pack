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
  IonContent,
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

import {
  matchPortableItems,
  parsePortable,
  parsePortableAll,
  PORTABLE_FILE_ACCEPT,
  type ParseResult,
} from '@/domain/portable'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const router = useRouter()
const master = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const rawText = ref('')
const parsed = ref<ParseResult | null>(null)

/**
 * A backup file (NFR-4.11) holds many documents where an exported template or
 * trip holds one. It gets a list rather than the merge preview: a restore is
 * "put my device back", not fifty per-item decisions, and the per-document
 * matching that commitPortableRestore does is the same default the preview
 * offers for a single file.
 */
const restore = ref<ParseResult[] | null>(null)

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  rawText.value = await file.text()
  preview()
}

function preview() {
  const documents = parsePortableAll(rawText.value)
  if (documents.length > 1) {
    restore.value = documents
    parsed.value = null
    return
  }
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

/** Restore every readable document of a backup file, then show the trips. */
function commitRestore() {
  const documents = restore.value ?? []
  orchestrator.commitPortableRestore(documents.flatMap((r) => (r.doc ? [r.doc] : [])))
  restore.value = null
  router.replace('/trips')
}

const restorable = computed(() => (restore.value ?? []).filter((r) => r.doc !== null).length)

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
    <IonContent class="ion-padding">
      <!-- File picker / paste -->
      <template v-if="!doc && !restore">
        <h2 class="section-title jp-eyebrow">Portable YAML file</h2>
        <p class="hint">A template or trip exported from any JIT-Pack instance (FR-18.1).</p>
        <input type="file" :accept="PORTABLE_FILE_ACCEPT" @change="onFile" />
        <IonTextarea
          class="paste-area"
          data-testid="portable-paste"
          placeholder="…or paste YAML here"
          :value="rawText"
          :rows="8"
          @ionInput="(e: CustomEvent) => (rawText = e.detail.value ?? '')"
        />
        <!-- Malformed files are rejected here, before any preview -->
        <IonNote v-if="parsed?.error" color="danger">{{ parsed.error }}</IonNote>
        <IonButton
          expand="block"
          data-testid="portable-preview"
          :disabled="rawText.trim() === ''"
          @click="preview"
        >
          Preview
        </IonButton>
      </template>

      <!-- Backup restore (NFR-4.11): a file of many documents -->
      <template v-else-if="restore">
        <h2 class="section-title jp-eyebrow" data-testid="portable-restore">Backup</h2>
        <p class="hint">
          {{ restore.length }} document{{ restore.length === 1 ? '' : 's' }} in this file. Importing
          adds them to what is already on this device; items that already exist are matched by name.
        </p>
        <IonList>
          <IonItem v-for="(entry, index) in restore" :key="index">
            <IonLabel>
              <h3>{{ entry.doc?.name ?? 'Unreadable document' }}</h3>
              <p v-if="entry.doc">
                {{ entry.doc.kind === 'template' ? 'Template' : 'Trip' }} ·
                {{ entry.doc.items.length }} item{{ entry.doc.items.length === 1 ? '' : 's' }}
              </p>
              <p v-else>{{ entry.error }}</p>
            </IonLabel>
            <IonChip v-if="!entry.doc" slot="end" color="danger" outline>skipped</IonChip>
          </IonItem>
        </IonList>
        <div class="actions">
          <IonButton fill="outline" @click="restore = null">Cancel</IonButton>
          <IonButton
            color="primary"
            data-testid="portable-restore-commit"
            :disabled="restorable === 0"
            @click="commitRestore"
          >
            Import all
          </IonButton>
        </div>
      </template>

      <!-- Preview (single screen, no wizard) -->
      <template v-else-if="doc">
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
          <IonButton color="primary" data-testid="portable-commit" @click="commit">
            Import {{ doc.kind === 'template' ? 'template' : 'trip' }}
          </IonButton>
        </div>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.section-title {
  margin: 16px 0 8px;
}

.hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-base);
}

.paste-area {
  margin: 12px 0;
  border: 1px solid var(--ion-color-light-shade);
  border-radius: var(--jp-r-sm);
  padding: 4px 8px;
}

.summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.summary-icon {
  font-size: var(--jp-icon-xl);
  color: var(--ion-color-primary);
}

.summary-name {
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-bold);
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
