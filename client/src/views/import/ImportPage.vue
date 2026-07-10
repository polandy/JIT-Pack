<script setup lang="ts">
/**
 * M15 — Import Wizard (FR-16.1–16.3, NFR-4.7).
 *
 * Four steps: file/paste → mapping (item column, category rows, trip
 * columns with include-toggle/name/date/series) → dedup against the
 * master inventory → confirm. Commit lands client-side through the
 * orchestrator (FR-19.4: Local Mode parity). CSV only — XLSX is
 * deferred; every spreadsheet tool exports CSV.
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
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonCheckbox,
  IonNote,
  IonSegment,
  IonSegmentButton,
} from '@ionic/vue'
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  analyzeGrid,
  buildImportPlan,
  findDuplicates,
  normalizeTripDate,
  parseSpreadsheet,
  type GridAnalysis,
} from '@/domain/spreadsheet'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const router = useRouter()
const master = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const step = ref(1)

// --- Step 1: file / paste ---
const rawText = ref('')
const grid = ref<string[][]>([])
const analysis = ref<GridAnalysis | null>(null)

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  rawText.value = await file.text()
}

function analyze() {
  grid.value = parseSpreadsheet(rawText.value)
  if (grid.value.length < 2) return
  const a = analyzeGrid(grid.value)
  analysis.value = a
  itemColumn.value = a.itemColumn
  categoryRows.value = new Set(a.categoryRows)
  // FR-16.1: all trip columns preselected ("select all" default).
  trips.value = a.tripColumns.map((t) => ({
    column: t.index,
    include: true,
    name: t.header || `Trip ${t.index}`,
    date: t.header,
    seriesId: '',
  }))
  step.value = 2
}

// --- Step 2: mapping (FR-16.1) ---
const itemColumn = ref(0)
const categoryRows = ref<Set<number>>(new Set())
const trips = ref<
  { column: number; include: boolean; name: string; date: string; seriesId: string }[]
>([])

function toggleCategoryRow(rowIdx: number, on: boolean) {
  const next = new Set(categoryRows.value)
  if (on) next.add(rowIdx)
  else next.delete(rowIdx)
  categoryRows.value = next
}

const mappingValid = computed(
  () =>
    trips.value.some((t) => t.include) &&
    trips.value
      .filter((t) => t.include)
      .every((t) => t.name.trim() !== '' && normalizeTripDate(t.date) !== null),
)

const mapping = computed(() => ({
  itemColumn: itemColumn.value,
  categoryRows: [...categoryRows.value],
  trips: trips.value
    .filter((t) => t.include)
    .map((t) => ({
      column: t.column,
      name: t.name.trim(),
      endDate: normalizeTripDate(t.date)!,
      seriesId: t.seriesId || null,
    })),
}))

/** Rows the current mapping treats as items, for the category toggle list. */
const namedRows = computed(() =>
  grid.value
    .map((row, idx) => ({ idx, name: (row[itemColumn.value] ?? '').trim() }))
    .filter((r) => r.idx > 0 && r.name !== ''),
)

// --- Step 3: dedup (FR-16.3) ---
const duplicates = computed(() => {
  const preview = buildImportPlan(grid.value, mapping.value, new Map())
  return findDuplicates(
    preview.items.map((i) => i.name),
    master.itemList,
  )
})
/** imported name → merge decision; exact matches default to merge. */
const mergeChoices = ref<Map<string, boolean>>(new Map())

function enterDedup() {
  const choices = new Map<string, boolean>()
  for (const match of duplicates.value) choices.set(match.imported, true)
  mergeChoices.value = choices
  step.value = duplicates.value.length > 0 ? 3 : 4
}

function setMerge(name: string, merge: boolean) {
  const next = new Map(mergeChoices.value)
  next.set(name, merge)
  mergeChoices.value = next
}

// --- Step 4: confirm ---
const plan = computed(() => {
  const decisions = new Map<string, string>()
  for (const match of duplicates.value) {
    if (mergeChoices.value.get(match.imported)) decisions.set(match.imported, match.existingId)
  }
  return buildImportPlan(grid.value, mapping.value, decisions)
})

const newItemCount = computed(() => plan.value.items.filter((i) => !i.existingItemId).length)

function commit() {
  orchestrator.commitImport(plan.value)
  router.replace('/tabs/trips')
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton default-href="/tabs/trips" />
        </IonButtons>
        <IonTitle>Import · step {{ step }}/4</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <!-- Step 1: file -->
      <section v-if="step === 1">
        <h2 class="section-title">Spreadsheet (CSV)</h2>
        <p class="hint">
          Rows are items (with category grouping rows), columns are trips with quantities. XLSX?
          Export it as CSV first.
        </p>
        <input type="file" accept=".csv,text/csv" @change="onFile" />
        <IonTextarea
          class="paste-area"
          placeholder="…or paste CSV here"
          :value="rawText"
          :rows="8"
          @ionInput="(e: CustomEvent) => (rawText = e.detail.value ?? '')"
        />
        <IonButton expand="block" :disabled="rawText.trim() === ''" @click="analyze">
          Analyze
        </IonButton>
      </section>

      <!-- Step 2: mapping -->
      <section v-if="step === 2">
        <h2 class="section-title">Trips to import</h2>
        <IonList>
          <IonItem v-for="trip in trips" :key="trip.column">
            <IonCheckbox
              slot="start"
              :checked="trip.include"
              @ionChange="(e: CustomEvent) => (trip.include = e.detail.checked)"
            />
            <IonInput
              placeholder="Trip name"
              :value="trip.name"
              @ionInput="(e: CustomEvent) => (trip.name = e.detail.value ?? '')"
            />
            <IonInput
              class="date-input"
              placeholder="Year or date"
              :value="trip.date"
              @ionInput="(e: CustomEvent) => (trip.date = e.detail.value ?? '')"
            />
            <IonSelect
              interface="popover"
              placeholder="Series"
              :value="trip.seriesId"
              aria-label="Target series"
              @ionChange="(e: CustomEvent) => (trip.seriesId = e.detail.value)"
            >
              <IonSelectOption value="">No series</IonSelectOption>
              <IonSelectOption v-for="s in master.seriesList" :key="s.id" :value="s.id">
                {{ s.name }}
              </IonSelectOption>
            </IonSelect>
          </IonItem>
        </IonList>
        <IonNote v-if="!mappingValid"
          >Each included trip needs a name and a year (e.g. 2024) or date.</IonNote
        >

        <h2 class="section-title">Item column</h2>
        <IonSegment
          :value="String(itemColumn)"
          @ionChange="(e: CustomEvent) => (itemColumn = Number(e.detail.value))"
        >
          <IonSegmentButton v-for="(header, idx) in grid[0]" :key="idx" :value="String(idx)">
            <IonLabel>{{ header || `Col ${idx + 1}` }}</IonLabel>
          </IonSegmentButton>
        </IonSegment>

        <h2 class="section-title">Category rows</h2>
        <IonList class="category-list">
          <IonItem v-for="row in namedRows" :key="row.idx">
            <IonCheckbox
              slot="start"
              :checked="categoryRows.has(row.idx)"
              @ionChange="(e: CustomEvent) => toggleCategoryRow(row.idx, e.detail.checked)"
            />
            <IonLabel :class="{ 'category-label': categoryRows.has(row.idx) }">{{
              row.name
            }}</IonLabel>
          </IonItem>
        </IonList>

        <div class="wizard-nav">
          <IonButton fill="outline" @click="step = 1">Back</IonButton>
          <IonButton :disabled="!mappingValid" @click="enterDedup">Next</IonButton>
        </div>
      </section>

      <!-- Step 3: dedup (FR-16.3) -->
      <section v-if="step === 3">
        <h2 class="section-title">Possible duplicates</h2>
        <p class="hint">These imported names look like items you already have.</p>
        <IonList>
          <IonItem v-for="match in duplicates" :key="match.imported">
            <IonLabel>
              <h3>{{ match.imported }}</h3>
              <p>existing: {{ match.existingName }}{{ match.exact ? ' (exact match)' : '' }}</p>
            </IonLabel>
            <IonSegment
              class="merge-segment"
              :value="mergeChoices.get(match.imported) ? 'merge' : 'separate'"
              @ionChange="(e: CustomEvent) => setMerge(match.imported, e.detail.value === 'merge')"
            >
              <IonSegmentButton value="merge"><IonLabel>Merge</IonLabel></IonSegmentButton>
              <IonSegmentButton value="separate"
                ><IonLabel>Keep separate</IonLabel></IonSegmentButton
              >
            </IonSegment>
          </IonItem>
        </IonList>
        <div class="wizard-nav">
          <IonButton fill="outline" @click="step = 2">Back</IonButton>
          <IonButton @click="step = 4">Next</IonButton>
        </div>
      </section>

      <!-- Step 4: confirm -->
      <section v-if="step === 4">
        <h2 class="section-title">Summary</h2>
        <IonList>
          <IonItem lines="none">
            <IonLabel>
              {{ plan.trips.length }} archived trip{{ plan.trips.length === 1 ? '' : 's' }},
              {{ newItemCount }} new item{{ newItemCount === 1 ? '' : 's' }} ({{
                plan.items.length - newItemCount
              }}
              merged), {{ plan.newCategories.length }} categor{{
                plan.newCategories.length === 1 ? 'y' : 'ies'
              }}
            </IonLabel>
          </IonItem>
          <IonItem v-for="trip in plan.trips" :key="trip.name" lines="none">
            <IonLabel>
              <h3>{{ trip.name }}</h3>
              <p>{{ trip.endDate }} · {{ trip.items.length }} items</p>
            </IonLabel>
          </IonItem>
        </IonList>
        <div class="wizard-nav">
          <IonButton fill="outline" @click="step = duplicates.length > 0 ? 3 : 2">Back</IonButton>
          <IonButton color="primary" @click="commit">Import</IonButton>
        </div>
      </section>
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

.date-input {
  max-width: 110px;
}

.category-list {
  max-height: 320px;
  overflow-y: auto;
}

.category-label {
  font-weight: 600;
}

.merge-segment {
  max-width: 240px;
}

.wizard-nav {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
</style>
