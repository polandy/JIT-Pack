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
  useIonRouter,
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
  type PortableDocument,
} from '@/domain/portable'
import { findExistingSubject } from '@/domain/portableImport'
import { presentToast } from '@/lib/toast'
import FilePickButton from '@/components/global/FilePickButton.vue'
import { t } from '@/i18n'
import { TRIP_FILTER_QUERY, filterForStatus } from '@/views/trips/tripFilter'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const router = useRouter()
const ionRouter = useIonRouter()
const master = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const tripStore = useTripStore()

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

async function onFile(file: File) {
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

/**
 * Whether this document would be a second copy of something already here
 * (ADR-030). The import rules' own function, not a second reading of them.
 *
 * Asked in the preview rather than only after the fact: "already here" is a
 * perfectly good answer, but a screen that gives it only once the button has
 * been pressed reads as an import that silently did nothing.
 */
function alreadyHere(candidate: PortableDocument | null | undefined): boolean {
  if (!candidate) return false
  return (
    findExistingSubject(candidate, {
      templateList: master.templateList,
      tripList: tripStore.tripList,
    }) !== undefined
  )
}

/** How long a confirmation stays up, as everywhere else on the app. */
const TOAST_MS = 3000
const matches = computed(() => (doc.value ? matchPortableItems(doc.value, master.itemList) : []))

/** Near-duplicates offer merge/keep-separate; exact matches default to merge. */
const mergeChoices = ref<Map<string, boolean>>(new Map())

function setMerge(name: string, merge: boolean) {
  const next = new Map(mergeChoices.value)
  next.set(name, merge)
  mergeChoices.value = next
}

/**
 * Restore every readable document of a backup file, then show the trips.
 *
 * `/tabs/trips`, not `/trips`: the latter is not a route (only `/trips/new`
 * and `/trips/:tripId` are), so the replace matched nothing and left the user
 * on the import form with the file still pasted in it — the restore had
 * happened and said nothing. Found by E2E-M18-05, which was the first thing
 * ever to walk this path.
 *
 * And on the segment the restored trips are actually on, because M2 opens on
 * Active and a restore that worked must not end on the words "No active
 * trips". That segment used to be a constant — every imported trip was
 * `planning` (FR-18.4) — and since ADR-024 a backup gives back the status it
 * saved, so a device of archived history restored onto a hard-coded *planned*
 * would land on an empty list and read as a restore that did nothing. It is
 * derived from the first restored trip now; a file of templates only keeps the
 * old default, having no trip to point at.
 */
function commitRestore() {
  const documents = restore.value ?? []
  const results = orchestrator.commitPortableRestore(
    documents.flatMap((r) => (r.doc ? [r.doc] : [])),
  )
  // ADR-030: a restore run twice adds nothing the second time, and saying how
  // many trips it left alone is the difference between that and a restore
  // that failed silently.
  const untouched = results.filter((r) => r.outcome === 'duplicate').length
  if (untouched > 0) {
    void presentToast({
      message: t('import.portable.restoreAlreadyHere', { n: untouched }),
      duration: TOAST_MS,
    })
  }
  restore.value = null
  const firstTrip = results.find((r) => r.kind === 'trip')
  const status = firstTrip ? tripStore.getTrip(firstTrip.id)?.status : undefined
  // A tab root is a root navigation — see the note in `ImportPage.vue`.
  ionRouter.navigate(
    { path: '/tabs/trips', query: { [TRIP_FILTER_QUERY]: filterForStatus(status) } },
    'root',
    'replace',
  )
}

const restorable = computed(() => (restore.value ?? []).filter((r) => r.doc !== null).length)

/** The one-line description of a document in the restore list. */
function documentSummary(entry: ParseResult): string {
  const parsed = entry.doc
  if (!parsed) return ''
  const kind = t(parsed.kind === 'template' ? 'import.portable.template' : 'import.portable.trip')
  const parts = [kind, t('import.portable.items', { n: parsed.items.length })]
  // FR-27.4: a restored trip keeps following its groups, and the list is the
  // only place that says so before the trip is opened.
  if (parsed.follows.length > 0) {
    parts.push(t('import.portable.follows', { n: parsed.follows.length }))
  }
  return parts.join(' · ')
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
  if (result.outcome === 'duplicate') {
    void presentToast({ message: t('import.portable.alreadyHereHint'), duration: TOAST_MS })
  }
  router.replace(result.kind === 'template' ? `/templates/${result.id}` : `/trips/${result.id}`)
}
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <!-- File picker / paste -->
      <template v-if="!doc && !restore">
        <h2 class="section-title jp-eyebrow">{{ t('import.portable.fileTitle') }}</h2>
        <p class="hint">{{ t('import.portable.fileHint') }}</p>
        <FilePickButton :accept="PORTABLE_FILE_ACCEPT" testid="portable-file" @file="onFile" />
        <IonTextarea
          class="paste-area"
          data-testid="portable-paste"
          :placeholder="t('import.portable.paste')"
          :value="rawText"
          :rows="8"
          @ionInput="(e: CustomEvent) => (rawText = e.detail.value ?? '')"
        />
        <!-- Malformed files are rejected here, before any preview -->
        <IonNote v-if="parsed?.error" color="danger" data-testid="portable-parse-error">{{
          parsed.error
        }}</IonNote>
        <IonButton
          expand="block"
          data-testid="portable-preview"
          :disabled="rawText.trim() === ''"
          @click="preview"
        >
          {{ t('import.portable.preview') }}
        </IonButton>
      </template>

      <!-- Backup restore (NFR-4.11): a file of many documents -->
      <template v-else-if="restore">
        <h2 class="section-title jp-eyebrow" data-testid="portable-restore">
          {{ t('import.portable.backupTitle') }}
        </h2>
        <p class="hint">{{ t('import.portable.backupHint', { n: restore.length }) }}</p>
        <IonList>
          <IonItem
            v-for="(entry, index) in restore"
            :key="index"
            data-testid="portable-restore-row"
          >
            <IonLabel>
              <h3>{{ entry.doc?.name ?? t('import.portable.unreadable') }}</h3>
              <p v-if="entry.doc" data-testid="portable-restore-summary">
                {{ documentSummary(entry) }}
              </p>
              <p v-else>{{ entry.error }}</p>
            </IonLabel>
            <IonChip v-if="!entry.doc" slot="end" color="danger" outline>
              {{ t('import.portable.skipped') }}
            </IonChip>
            <IonChip
              v-else-if="alreadyHere(entry.doc)"
              slot="end"
              color="medium"
              outline
              data-testid="portable-already-here"
            >
              {{ t('import.portable.alreadyHere') }}
            </IonChip>
          </IonItem>
        </IonList>
        <div class="actions">
          <IonButton fill="outline" @click="restore = null">{{ t('common.cancel') }}</IonButton>
          <IonButton
            color="primary"
            data-testid="portable-restore-commit"
            :disabled="restorable === 0"
            @click="commitRestore"
          >
            {{ t('import.portable.importAll') }}
          </IonButton>
        </div>
      </template>

      <!-- Preview (single screen, no wizard) -->
      <template v-else-if="doc">
        <div class="summary" data-testid="portable-summary">
          <IonIcon :icon="documentTextOutline" class="summary-icon" />
          <div>
            <h2 class="summary-name">{{ doc.name }}</h2>
            <p class="summary-meta">
              {{
                doc.kind === 'template' ? t('import.portable.template') : t('import.portable.trip')
              }}
              · {{ t('import.portable.items', { n: doc.items.length }) }} ·
              {{ t('import.portable.schema', { n: doc.schema_version }) }}
            </p>
          </div>
        </div>
        <IonNote
          v-if="parsed?.newerSchema"
          class="schema-warning"
          data-testid="portable-newer-schema"
        >
          <IonIcon :icon="warningOutline" />
          {{ t('import.portable.newerSchema') }}
        </IonNote>
        <IonNote v-if="alreadyHere(doc)" class="schema-warning" data-testid="portable-already-here">
          <IonIcon :icon="warningOutline" />
          {{ t('import.portable.alreadyHereHint') }}
        </IonNote>

        <IonList>
          <IonItem
            v-for="match in matches"
            :key="match.name"
            :data-testid="`portable-match-${match.name}`"
          >
            <IonLabel>
              <h3>{{ match.name }}</h3>
              <p v-if="match.state === 'near'">
                {{ t('import.portable.similar', { name: match.existingName ?? '' }) }}
              </p>
            </IonLabel>
            <IonChip
              v-if="match.state !== 'near'"
              slot="end"
              :color="match.state === 'new' ? 'primary' : 'success'"
              outline
            >
              {{
                match.state === 'new'
                  ? t('import.portable.stateNew')
                  : t('import.portable.stateMatched')
              }}
            </IonChip>
            <IonSegment
              v-else
              slot="end"
              class="merge-segment"
              :value="mergeChoices.get(match.name) ? 'merge' : 'separate'"
              @ionChange="(e: CustomEvent) => setMerge(match.name, e.detail.value === 'merge')"
            >
              <IonSegmentButton value="merge" data-testid="portable-merge">
                <IonLabel>{{ t('import.portable.merge') }}</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="separate" data-testid="portable-separate">
                <IonLabel>{{ t('import.portable.keepSeparate') }}</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </IonItem>
        </IonList>

        <div class="actions">
          <IonButton fill="outline" @click="parsed = null">{{ t('common.cancel') }}</IonButton>
          <IonButton color="primary" data-testid="portable-commit" @click="commit">
            {{
              doc.kind === 'template'
                ? t('import.portable.importTemplate')
                : t('import.portable.importTrip')
            }}
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
