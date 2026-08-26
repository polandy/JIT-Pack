<script setup lang="ts">
/**
 * M15 — Import Wizard (FR-16.1–16.3, NFR-4.7).
 *
 * Four steps: file/paste → mapping (item column, category column or
 * category rows, trip columns with include-toggle/name/date/series) →
 * dedup against the master inventory → confirm. Commit lands client-side through the
 * orchestrator (FR-19.4: Local Mode parity). CSV only — XLSX is
 * deferred; every spreadsheet tool exports CSV.
 */
import {
  IonPage,
  IonContent,
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
  parseSpreadsheet,
  parseTripDate,
  type GridAnalysis,
} from '@/domain/spreadsheet'
import { formatDay, t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import { TRIP_STATUS_ARCHIVED } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { filterForStatus, TRIP_FILTER_QUERY } from '@/views/trips/tripFilter'

const router = useRouter()
const master = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

/**
 * The category-column picker's "none" choice. IonSegment values are strings
 * and every other one is a column index, so the absence needs a name of its
 * own rather than an empty string a stray column could also produce.
 */
const NO_CATEGORY_COLUMN = 'none'

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
  categoryColumn.value = a.categoryColumn
  categoryRows.value = new Set(a.categoryRows)
  // FR-16.1: all trip columns preselected ("select all" default) — except
  // one the header neither names nor dates, which cannot be validated and
  // would hold the whole mapping hostage until it is found among thirty.
  trips.value = a.tripColumns.map((t) => ({
    column: t.index,
    include: t.name !== '' || t.date !== '',
    name: t.name,
    date: t.date,
    seriesId: '',
  }))
  step.value = 2
}

// --- Step 2: mapping (FR-16.1) ---
const itemColumn = ref(0)
const categoryColumn = ref<number | null>(null)
const categoryRows = ref<Set<number>>(new Set())

/** The header block's own rows, which describe columns rather than items. */
const headerRows = computed(() => analysis.value?.headerRows ?? 1)

/**
 * Candidates for the item- and category-column pickers: every column that is
 * not a trip column. A sheet of thirty trips would otherwise offer thirty-four
 * buttons labelled by their year — neither of these two columns can be one
 * that holds quantities, so offering them is noise, not choice.
 */
const columnChoices = computed(() => {
  const trips = new Set(analysis.value?.tripColumns.map((t) => t.index) ?? [])
  return Array.from({ length: Math.max(0, ...grid.value.map((r) => r.length)) }, (_, idx) => idx)
    .filter((idx) => !trips.has(idx))
    .map((idx) => ({ idx, label: columnLabel(idx) }))
})

/**
 * A column's own label. The *last* header cell that says anything, because
 * where a header block has two rows the lower one names and the upper one
 * dates — and a column called "2016" names nothing here.
 */
function columnLabel(idx: number): string {
  for (let rowIdx = headerRows.value - 1; rowIdx >= 0; rowIdx--) {
    const value = (grid.value[rowIdx]?.[idx] ?? '').trim()
    if (value !== '') return value
  }
  return t('import.wizard.column', { n: idx + 1 })
}
const trips = ref<
  { column: number; include: boolean; name: string; date: string; seriesId: string }[]
>([])

function toggleCategoryRow(rowIdx: number, on: boolean) {
  const next = new Set(categoryRows.value)
  if (on) next.add(rowIdx)
  else next.delete(rowIdx)
  categoryRows.value = next
}

/** Rows the plan would import as items — the category ticks are not items. */
const importableRows = computed(
  () => namedRows.value.filter((r) => !categoryRows.value.has(r.idx)).length,
)

/**
 * FR-16.1: a trip column is *not* required. A sheet that is a list of things
 * rather than a matrix of trips is the ordinary way an inventory arrives, and
 * demanding one made the only way in a throwaway trip the user then deleted.
 * What is required is something to import and, for the columns that are
 * ticked, the two facts a trip cannot be created without.
 */
const mappingValid = computed(
  () =>
    importableRows.value > 0 &&
    trips.value
      .filter((t) => t.include)
      .every((t) => t.name.trim() !== '' && parseTripDate(t.date) !== null),
)

/** Which of the two reasons the mapping is not valid yet, for the note. */
const mappingHint = computed(() =>
  importableRows.value === 0 ? 'import.wizard.nothingToImport' : 'import.wizard.mappingInvalid',
)

const mapping = computed(() => ({
  headerRows: headerRows.value,
  itemColumn: itemColumn.value,
  categoryColumn: categoryColumn.value,
  categoryRows: [...categoryRows.value],
  trips: trips.value
    .filter((t) => t.include)
    .map((t) => ({
      column: t.column,
      name: t.name.trim(),
      ...parseTripDate(t.date)!,
      seriesId: t.seriesId || null,
    })),
}))

/** Rows the current mapping treats as items, for the category toggle list. */
const namedRows = computed(() =>
  grid.value
    .map((row, idx) => ({ idx, name: (row[itemColumn.value] ?? '').trim() }))
    .filter((r) => r.idx >= headerRows.value && r.name !== ''),
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

/**
 * The confirmation line, assembled from four separately pluralized counts:
 * one message with four `{n}` slots cannot pluralize them independently, and
 * the in-house module's rule is deliberately one/other (NFR-4.12).
 */
const summaryLine = computed(() =>
  [
    t('import.wizard.summaryTrips', { n: plan.value.trips.length }),
    t('import.wizard.summaryItems', { n: newItemCount.value }),
    t('import.wizard.summaryMerged', { n: plan.value.items.length - newItemCount.value }),
    t('import.wizard.summaryCategories', { n: plan.value.newCategories.length }),
  ].join(', '),
)

function commit() {
  orchestrator.commitImport(plan.value)
  // Land where the result is. FR-16.2 creates archived trips and M2 opens on
  // Active, so without naming the segment a migration of a decade of history
  // ended on the words "No active trips" (the miss ADR-024 fixed on the
  // restore path) — and an import that created no trip at all has its whole
  // result in the inventory, where the trip list would say the same thing.
  router.replace(
    plan.value.trips.length === 0
      ? { path: '/tabs/items' }
      : {
          path: '/tabs/trips',
          query: { [TRIP_FILTER_QUERY]: filterForStatus(TRIP_STATUS_ARCHIVED) },
        },
  )
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => t('import.wizard.title', { step: step.value }))
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <!-- Step 1: file -->
      <section v-if="step === 1">
        <h2 class="section-title jp-eyebrow">{{ t('import.wizard.csvTitle') }}</h2>
        <p class="hint">{{ t('import.wizard.csvHint') }}</p>
        <input type="file" accept=".csv,text/csv" @change="onFile" />
        <IonTextarea
          class="paste-area"
          data-testid="import-paste"
          :placeholder="t('import.wizard.paste')"
          :value="rawText"
          :rows="8"
          @ionInput="(e: CustomEvent) => (rawText = e.detail.value ?? '')"
        />
        <IonButton
          expand="block"
          data-testid="import-analyze"
          :disabled="rawText.trim() === ''"
          @click="analyze"
        >
          {{ t('import.wizard.analyze') }}
        </IonButton>
      </section>

      <!-- Step 2: mapping -->
      <section v-if="step === 2">
        <h2 class="section-title jp-eyebrow">{{ t('import.wizard.tripsTitle') }}</h2>
        <IonList>
          <IonItem
            v-for="trip in trips"
            :key="trip.column"
            :data-testid="`import-trip-${trip.column}`"
          >
            <IonCheckbox
              slot="start"
              :checked="trip.include"
              @ionChange="(e: CustomEvent) => (trip.include = e.detail.checked)"
            />
            <IonInput
              :placeholder="t('import.wizard.tripName')"
              :value="trip.name"
              @ionInput="(e: CustomEvent) => (trip.name = e.detail.value ?? '')"
            />
            <IonInput
              class="date-input"
              :placeholder="t('import.wizard.tripDate')"
              :value="trip.date"
              @ionInput="(e: CustomEvent) => (trip.date = e.detail.value ?? '')"
            />
            <IonSelect
              interface="popover"
              :placeholder="t('import.wizard.series')"
              :value="trip.seriesId"
              :aria-label="t('import.wizard.seriesLabel')"
              @ionChange="(e: CustomEvent) => (trip.seriesId = e.detail.value)"
            >
              <IonSelectOption value="">{{ t('import.wizard.noSeries') }}</IonSelectOption>
              <IonSelectOption v-for="s in master.seriesList" :key="s.id" :value="s.id">
                {{ s.name }}
              </IonSelectOption>
            </IonSelect>
          </IonItem>
        </IonList>
        <IonNote v-if="!mappingValid" data-testid="import-mapping-note">
          {{ t(mappingHint) }}
        </IonNote>

        <h2 class="section-title jp-eyebrow">{{ t('import.wizard.itemColumn') }}</h2>
        <IonSegment
          data-testid="item-column"
          :value="String(itemColumn)"
          @ionChange="(e: CustomEvent) => (itemColumn = Number(e.detail.value))"
        >
          <IonSegmentButton
            v-for="choice in columnChoices"
            :key="choice.idx"
            :value="String(choice.idx)"
          >
            <IonLabel>{{ choice.label }}</IonLabel>
          </IonSegmentButton>
        </IonSegment>

        <h2 class="section-title jp-eyebrow">{{ t('import.wizard.categoryColumn') }}</h2>
        <p class="hint">{{ t('import.wizard.categoryColumnHint') }}</p>
        <IonSegment
          data-testid="category-column"
          :value="categoryColumn === null ? NO_CATEGORY_COLUMN : String(categoryColumn)"
          @ionChange="
            (e: CustomEvent) =>
              (categoryColumn =
                e.detail.value === NO_CATEGORY_COLUMN ? null : Number(e.detail.value))
          "
        >
          <IonSegmentButton :value="NO_CATEGORY_COLUMN">
            <IonLabel>{{ t('import.wizard.noCategoryColumn') }}</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton
            v-for="choice in columnChoices"
            :key="choice.idx"
            :value="String(choice.idx)"
          >
            <IonLabel>{{ choice.label }}</IonLabel>
          </IonSegmentButton>
        </IonSegment>

        <h2 class="section-title jp-eyebrow">{{ t('import.wizard.categoryRows') }}</h2>
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
          <IonButton fill="outline" @click="step = 1">{{ t('common.back') }}</IonButton>
          <IonButton data-testid="import-next" :disabled="!mappingValid" @click="enterDedup">
            {{ t('import.wizard.next') }}
          </IonButton>
        </div>
      </section>

      <!-- Step 3: dedup (FR-16.3) -->
      <section v-if="step === 3">
        <h2 class="section-title jp-eyebrow">{{ t('import.wizard.duplicates') }}</h2>
        <p class="hint">{{ t('import.wizard.duplicatesHint') }}</p>
        <IonList>
          <IonItem v-for="match in duplicates" :key="match.imported">
            <IonLabel>
              <h3>{{ match.imported }}</h3>
              <p>
                {{
                  t(match.exact ? 'import.wizard.existingExact' : 'import.wizard.existing', {
                    name: match.existingName,
                  })
                }}
              </p>
            </IonLabel>
            <IonSegment
              class="merge-segment"
              :value="mergeChoices.get(match.imported) ? 'merge' : 'separate'"
              @ionChange="(e: CustomEvent) => setMerge(match.imported, e.detail.value === 'merge')"
            >
              <IonSegmentButton value="merge">
                <IonLabel>{{ t('import.portable.merge') }}</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="separate">
                <IonLabel>{{ t('import.portable.keepSeparate') }}</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </IonItem>
        </IonList>
        <div class="wizard-nav">
          <IonButton fill="outline" @click="step = 2">{{ t('common.back') }}</IonButton>
          <IonButton @click="step = 4">{{ t('import.wizard.next') }}</IonButton>
        </div>
      </section>

      <!-- Step 4: confirm -->
      <section v-if="step === 4">
        <h2 class="section-title jp-eyebrow">{{ t('import.wizard.summary') }}</h2>
        <IonList>
          <IonItem lines="none">
            <IonLabel data-testid="import-summary-line">{{ summaryLine }}</IonLabel>
          </IonItem>
          <IonItem
            v-for="trip in plan.trips"
            :key="trip.name"
            :data-testid="`import-summary-${trip.name}`"
            lines="none"
          >
            <IonLabel>
              <h3>{{ trip.name }}</h3>
              <p>
                {{ trip.endDate ? formatDay(trip.endDate) : trip.year }} ·
                {{ t('import.portable.items', { n: trip.items.length }) }}
              </p>
            </IonLabel>
          </IonItem>
        </IonList>
        <div class="wizard-nav">
          <IonButton fill="outline" @click="step = duplicates.length > 0 ? 3 : 2">
            {{ t('common.back') }}
          </IonButton>
          <IonButton data-testid="import-commit" color="primary" @click="commit">
            {{ t('import.wizard.commit') }}
          </IonButton>
        </div>
      </section>
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

.date-input {
  max-width: 110px;
}

.category-list {
  max-height: 320px;
  overflow-y: auto;
}

.category-label {
  font-weight: var(--jp-weight-semibold);
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
