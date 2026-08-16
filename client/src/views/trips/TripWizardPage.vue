<script setup lang="ts">
/**
 * M3 — Trip Creation Wizard
 *
 * Four steps: metadata (FR-2.1/2.1a, attributes FR-15.1) → travelers
 * + sharing/roles (FR-2.5, FR-4.5/4.7) → template selection with live
 * dedup/exclusion preview (FR-2.2/2.3a/15.2) → quantity review.
 * "Create trip" commits the cascade through the orchestrator and opens
 * M4. The draft lives in component state until then — Cancel leaves no
 * residue.
 *
 * The sharing part of step 2 renders only with an OIDC session — in
 * Single-User and Local Mode there is no second account to share with
 * (FR-17.3/FR-19.3/G-8).
 */
import {
  IonPage,
  IonContent,
  IonButton,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonCheckbox,
  IonIcon,
  IonNote,
  IonChip,
} from '@ionic/vue'
import { addOutline, chevronForwardOutline, closeOutline, personOutline } from 'ionicons/icons'
import { computed, inject, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { loadTokens } from '@/auth/tokens'
import { t } from '@/i18n'
import GroupPeekSheet from '@/components/templates/GroupPeekSheet.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import {
  PREVIEW_ROW_NAMES,
  previewLines,
  resolvedLines,
  type LinePreview,
} from '@/domain/templates'
import { attributeLabel } from '@/lib/attributeLabels'
import { resolveDependencies } from '@/domain/dependencies'
import { durationDays, generateTripItems, type MergedOverlap } from '@/domain/instantiate'
import { suggestQuantities, type QuantitySuggestion } from '@/domain/suggestions'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { Template, TemplateKind } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { tripOrderKey } from '@/domain/trips'
import { defaultTravelers } from '@/composables/useDefaultTravelers'

const route = useRoute()
const router = useRouter()
const masterStore = useMasterStore()
const tripStore = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const step = ref(1)

// --- Step 1: metadata (FR-2.1/2.1a/15.1) ---
const name = ref('')
/**
 * FR-2.1b: the year is the only temporal fact a trip needs, and it starts
 * on the current one — the overwhelmingly common case is a trip this year
 * or the next, and a preselected value means the required field is
 * already satisfied when the screen opens.
 */
const YEAR_SPAN = 6
const thisYear = new Date().getFullYear()
const yearChoices = Array.from({ length: YEAR_SPAN }, (_, i) => thisYear - 1 + i)
const year = ref(thisYear)

/**
 * FR-2.1c: step 1 shows the two fields it requires and folds the rest
 * away — the FR-25.7/FR-24.5 idiom applied to trip creation. A trip is
 * created far more often than it is configured, and seven fields at once
 * make the common case look like the rare one.
 */
const moreOpen = ref(false)

const startDate = ref('')
const endDate = ref('')
const season = ref('')
const transportMode = ref('')
const accommodation = ref('')
const tagsInput = ref('')

// --- Series picker (FR-13.1) — '' none, 'new' inline creation ---
const seriesChoice = ref<string>('')
const newSeriesName = ref('')

/** Picking a series prefills empty attribute chips from its defaults. */
function pickSeries(choice: string) {
  seriesChoice.value = choice
  const defaults =
    choice && choice !== 'new' ? masterStore.getSeries(choice)?.default_attributes : null
  if (!defaults) return
  if (!season.value && typeof defaults.season === 'string') season.value = defaults.season
  if (!transportMode.value && typeof defaults.transport_mode === 'string')
    transportMode.value = defaults.transport_mode
  if (!accommodation.value && typeof defaults.accommodation === 'string')
    accommodation.value = defaults.accommodation
}

// M16 "New trip in series" arrives with ?series=<id>.
const preselect = route.query.series
if (typeof preselect === 'string' && masterStore.getSeries(preselect)) {
  pickSeries(preselect)
}

const duration = computed(() => durationDays(startDate.value || null, endDate.value))

const attributes = computed<Record<string, unknown> | null>(() => {
  const attrs: Record<string, unknown> = {}
  if (season.value) attrs.season = season.value
  if (transportMode.value) attrs.transport_mode = transportMode.value
  if (accommodation.value) attrs.accommodation = accommodation.value
  const tags = tagsInput.value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  if (tags.length > 0) attrs.tags = tags
  return Object.keys(attrs).length > 0 ? attrs : null
})

// --- Step 2: travelers (FR-2.5) ---
// FR-2.5a: the household's default travellers are the starting point of
// every trip; step 2 adds, renames and removes them exactly as before.
const travelers = ref<{ name: string }[]>(defaultTravelers().names.value.map((name) => ({ name })))

function addTraveler() {
  travelers.value = [...travelers.value, { name: '' }]
}

function removeTraveler(index: number) {
  travelers.value = travelers.value.filter((_, i) => i !== index)
}

// --- Step 2: sharing & roles (FR-4.5/4.7) ---
const mode = localStorage.getItem('jitpack_mode') as 'local' | 'server' | null
const collaborative = mode === 'server' && !!loadTokens()

const directory = ref<{ user_id: string; display_name: string }[]>([])
const myUserId = ref<string | null>(null)
const shares = ref<{ userId: string; role: 'admin' | 'editor' }[]>([])

onMounted(async () => {
  if (!collaborative) return
  const [users, me] = await Promise.all([orchestrator.fetchUsers(), orchestrator.fetchMe()])
  directory.value = users
  myUserId.value = me?.user_id ?? null
})

/** Accounts still shareable: not me (Owner anyway), not already added. */
const shareCandidates = computed(() =>
  directory.value.filter(
    (u) => u.user_id !== myUserId.value && !shares.value.some((s) => s.userId === u.user_id),
  ),
)

function addShare(userId: string) {
  if (!userId || shares.value.some((s) => s.userId === userId)) return
  shares.value = [...shares.value, { userId, role: 'editor' }]
}

function setShareRole(index: number, role: 'admin' | 'editor') {
  shares.value = shares.value.map((s, i) => (i === index ? { ...s, role } : s))
}

function removeShare(index: number) {
  shares.value = shares.value.filter((_, i) => i !== index)
}

function shareName(userId: string): string {
  return directory.value.find((u) => u.user_id === userId)?.display_name ?? userId
}

// --- Step 3: template selection + live preview (FR-2.2/2.3a/15.2) ---
const selectedTemplateIds = ref<Set<string>>(new Set())

function toggleTemplate(id: string, checked: boolean) {
  const next = new Set(selectedTemplateIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedTemplateIds.value = next
}

/**
 * FR-27.6: the two scopes are separate sections here, mirroring M7 — a
 * Ferien-Vorlage is what a trip starts from, groups are what you add to it.
 *
 * Rows are built in a computed and sorted **by name**, as M7 does: the store's
 * list follows Map insertion, which follows whatever order the sync or
 * IndexedDB produced, so an unsorted section reads differently on two devices.
 * Each row's count is what picking it would actually add — the resolved
 * composition, not the template's own positions (FR-27.2), which for a
 * Ferien-Vorlage are frequently none. Resolving here rather than in the
 * template keeps a checkbox tap from re-resolving every row.
 */
interface ScopeRow {
  template: Template
  count: number
  /** FR-27.12: the first few names, so the row answers the easy case itself. */
  preview: LinePreview
}

function scopeRows(kind: TemplateKind): ScopeRow[] {
  return masterStore.templateList
    .filter((tpl) => tpl.kind === kind)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tpl) => {
      const lines = resolvedLines(masterStore.resolve(tpl.id), masterStore.itemList)
      return { template: tpl, count: lines.length, preview: previewLines(lines, PREVIEW_ROW_NAMES) }
    })
}

/** FR-27.12: which group the peek sheet is showing, if any. */
const peekTemplateId = ref<string | null>(null)

function previewText(preview: LinePreview): string {
  const names = preview.names.join(' · ')
  return preview.rest > 0 ? `${names} ${t('templates.previewMore', { n: preview.rest })}` : names
}

const vacationTemplates = computed(() => scopeRows('template'))
const groupTemplates = computed(() => scopeRows('group'))

/**
 * The Vorlagen that already bring a group along. Picking it again changes
 * nothing — the dedup swallows it — so the row says so rather than letting
 * the user believe they added something (the FR-25.13 duplicate-report rule).
 */
const bringingVorlagen = computed(() => {
  const byGroup = new Map<string, string[]>()
  for (const id of selectedTemplateIds.value) {
    const picked = masterStore.getTemplate(id)
    if (!picked || picked.kind !== 'template') continue
    for (const inc of masterStore.getIncludes(id)) {
      const names = byGroup.get(inc.included_template_id) ?? []
      names.push(picked.name)
      byGroup.set(inc.included_template_id, names)
    }
  }
  return byGroup
})

/** FR-27.7: how many preparation todos the generated trip will start with. */
const taskCount = computed(() =>
  generation.value.items.reduce((sum, item) => sum + item.tasks.length, 0),
)

/**
 * FR-27.2: a merge is reported by name — "Kamera nur 1× — in Makro & Wildlife".
 * The same two sentences the M8 resolution footer uses: it is the same fact
 * about the same composition, and two wordings would eventually disagree.
 */
function mergeLine(merge: MergedOverlap): string {
  return t(merge.strategy === 'sum' ? 'templates.mergeSum' : 'templates.mergeMax', {
    name: merge.item_name,
    n: merge.quantity,
    groups: merge.sources.map((s) => s.name).join(' & '),
  })
}

const generation = computed(() => {
  // The whole catalogue, not the picked slice: a picked Ferien-Vorlage pulls in
  // the positions of the Gruppen it includes (FR-27.2), which the wizard does
  // not know about until generation resolves the composition.
  const templates = masterStore.templateList
  return generateTripItems({
    templates,
    selectedTemplateIds: [...selectedTemplateIds.value],
    includes: masterStore.includeList,
    templateItemTasks: masterStore.templateItemTaskList,
    templateItems: templates.flatMap((t) => masterStore.getTemplateItems(t.id)),
    masterItems: masterStore.itemList,
    trip: {
      duration_days: duration.value,
      attributes: attributes.value,
      travelers: travelers.value,
    },
  })
})

// --- Companion items (FR-20.2–20.4) ---

const companionResolution = computed(() =>
  resolveDependencies({
    onList: generation.value.items.map((i) => ({
      source_item_id: i.source_item_id,
      quantity: i.quantity,
    })),
    dependencies: masterStore.dependencyList,
    masterItems: masterStore.itemList,
  }),
)

// FR-20.4: suggested companions never join without the user's tap.
const acceptedSuggestions = ref<Set<string>>(new Set())

function toggleSuggestion(itemId: string, checked: boolean) {
  const next = new Set(acceptedSuggestions.value)
  if (checked) next.add(itemId)
  else next.delete(itemId)
  acceptedSuggestions.value = next
}

/** Companion rows for the draft — required plus accepted suggestions. */
function companionRows() {
  const row = (itemId: string, name: string, quantity: number) => {
    const master = masterStore.getItem(itemId)
    return {
      source_item_id: itemId,
      source_template_id: null,
      name,
      category_name: master?.category_name ?? null,
      weight_grams: master?.weight_grams ?? null,
      value_cents: master?.value_cents ?? null,
      quantity,
      mode: 'pack' as const,
      late_packer: false,
      traveler_index: null,
      // A companion comes from a dependency, not from a template position, so
      // there is no FR-27.7 task to carry (FR-20.2).
      tasks: [] as string[],
    }
  }
  return [
    ...companionResolution.value.required.map((c) => row(c.item_id, c.name, c.quantity)),
    ...companionResolution.value.suggested
      .filter((s) => acceptedSuggestions.value.has(s.item_id))
      .map((s) => row(s.item_id, s.name, s.quantity)),
  ]
}

// --- Step 4: quantity review + destination checklist offer (FR-13.3) ---
const quantityOverrides = ref<Record<number, number>>({})
const includeChecklist = ref(true)

const offeredChecklist = computed(() => {
  if (!seriesChoice.value || seriesChoice.value === 'new') return []
  const profile = masterStore.getDestinationProfile(seriesChoice.value)
  return profile ? masterStore.getChecklistItems(profile.id) : []
})

function reviewQuantity(index: number): number {
  return quantityOverrides.value[index] ?? generation.value.items[index]!.quantity
}

function overrideQuantity(index: number, value: string) {
  const qty = Number(value)
  if (!Number.isFinite(qty) || qty < 0) return
  quantityOverrides.value = { ...quantityOverrides.value, [index]: Math.floor(qty) }
}

// FR-14.2: duration-normalized median of the series' recent trips (synced
// on-device), so step 4 can offer a one-tap history default per item.
const suggestions = computed(() => {
  const seriesId = seriesChoice.value && seriesChoice.value !== 'new' ? seriesChoice.value : null
  if (!seriesId) return new Map<string, QuantitySuggestion>()
  // Fall back an unknown duration to the target, making normalization a
  // no-op for that trip rather than distorting it (FR-2.1a spirit).
  const target = duration.value ?? 1
  const history = tripStore.tripList
    .filter((t) => t.series_id === seriesId)
    .map((t) => ({
      id: t.id,
      orderKey: tripOrderKey(t),
      year: t.year,
      durationDays: durationDays(t.start_date, t.end_date) ?? target,
      items: tripStore
        .getItems(t.id)
        .filter((i) => i.source_item_id)
        .map((i) => ({ sourceItemId: i.source_item_id as string, quantity: i.quantity })),
    }))
  return suggestQuantities(history, target)
})

/** The history suggestion for a row, only when it differs from the value
 * currently shown (nothing to offer otherwise). */
function suggestionFor(index: number): QuantitySuggestion | null {
  const src = generation.value.items[index]?.source_item_id
  if (!src) return null
  const s = suggestions.value.get(src)
  return s && s.suggested !== reviewQuantity(index) ? s : null
}

function suggestionHint(s: QuantitySuggestion): string {
  return s.history.map((h) => `${h.year}: ${h.quantity}`).join(' · ')
}

function acceptSuggestion(index: number) {
  const s = suggestionFor(index)
  if (s) quantityOverrides.value = { ...quantityOverrides.value, [index]: s.suggested }
}

function travelerName(index: number | null): string | null {
  return index === null ? null : travelers.value[index]?.name || `Traveler ${index + 1}`
}

/**
 * What is set behind the fold, on the fold itself. An option nobody can
 * see is one nobody remembers setting — the same reason FR-25.11a keeps
 * the filter's chips on screen.
 */
const optionalSummary = computed(() => {
  const parts: string[] = []
  if (startDate.value && endDate.value) parts.push(`${startDate.value} – ${endDate.value}`)
  else if (startDate.value || endDate.value) parts.push(startDate.value || endDate.value)
  const series = masterStore.seriesList.find((s) => s.id === seriesChoice.value)
  if (series) parts.push(series.name)
  else if (seriesChoice.value === 'new' && newSeriesName.value.trim()) {
    parts.push(newSeriesName.value.trim())
  }
  // Through the catalogue, not raw: the summary is the only place these
  // values are read outside their own select, and "holiday_flat" is not
  // a word in either language.
  for (const attribute of [season.value, transportMode.value, accommodation.value]) {
    if (attribute) parts.push(attributeLabel(attribute))
  }
  return parts.join(' · ')
})

// --- Navigation ---
const stepValid = computed(() => {
  if (step.value === 1) {
    // No date gate any more (FR-2.1b): the year is preselected, so the
    // only thing that can be missing here is a name.
    return (
      name.value.trim() !== '' &&
      (seriesChoice.value !== 'new' || newSeriesName.value.trim() !== '')
    )
  }
  if (step.value === 2) return travelers.value.every((t) => t.name.trim() !== '')
  return true
})

function next() {
  if (step.value < 4) step.value++
}

function back() {
  if (step.value > 1) step.value--
}

function createTrip() {
  const items = [
    ...generation.value.items.map((item, index) => ({
      ...item,
      source_template_id: item.source_template_id as string | null,
      quantity: reviewQuantity(index),
    })),
    ...companionRows(),
  ]
  const tripId = orchestrator.createTripFromWizard({
    name: name.value.trim(),
    year: year.value,
    startDate: startDate.value || null,
    endDate: endDate.value || null,
    attributes: attributes.value,
    travelers: travelers.value.map((t) => ({ name: t.name.trim() })),
    items,
    seriesId: seriesChoice.value && seriesChoice.value !== 'new' ? seriesChoice.value : null,
    newSeriesName: seriesChoice.value === 'new' ? newSeriesName.value.trim() : null,
    checklistItems: includeChecklist.value
      ? offeredChecklist.value.map((c) => ({ label: c.label, mode: c.mode }))
      : [],
    members: shares.value,
  })
  router.replace(`/trips/${tripId}`)
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => `New trip · step ${step.value}/4`)
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <!-- Step 1: metadata -->
      <section v-if="step === 1" data-testid="wizard-step-1">
        <h2 class="section-title jp-eyebrow">{{ t('wizard.sectionTrip') }}</h2>
        <IonList>
          <IonItem>
            <IonInput
              data-testid="wizard-name"
              :label="t('wizard.name')"
              label-placement="stacked"
              :placeholder="t('wizard.namePlaceholder')"
              :value="name"
              @ionInput="(e: CustomEvent) => (name = e.detail.value ?? '')"
            />
          </IonItem>
          <IonItem>
            <IonSelect
              data-testid="wizard-year"
              :label="t('wizard.year')"
              label-placement="stacked"
              interface="popover"
              :value="year"
              @ionChange="(e: CustomEvent) => (year = Number(e.detail.value))"
            >
              <IonSelectOption v-for="option in yearChoices" :key="option" :value="option">
                {{ option }}
              </IonSelectOption>
            </IonSelect>
          </IonItem>
        </IonList>

        <!-- FR-2.1c: everything optional behind one row, which states what
             is set behind it — a folded option nobody can see is one
             nobody remembers setting. -->
        <button
          class="more-row"
          :class="{ open: moreOpen }"
          data-testid="wizard-more"
          @click="moreOpen = !moreOpen"
        >
          <IonIcon :icon="chevronForwardOutline" class="caret" />
          <span class="more-label">{{ t('wizard.moreOptions') }}</span>
          <span class="more-summary" data-testid="wizard-more-summary">
            {{ optionalSummary || t('wizard.moreSummaryEmpty') }}
          </span>
        </button>

        <template v-if="moreOpen">
          <IonList>
            <IonItem>
              <IonInput
                data-testid="wizard-start-date"
                :label="t('wizard.startDate')"
                label-placement="stacked"
                type="date"
                :value="startDate"
                @ionInput="(e: CustomEvent) => (startDate = e.detail.value ?? '')"
              />
            </IonItem>
            <IonItem>
              <IonInput
                data-testid="wizard-end-date"
                :label="t('wizard.endDate')"
                label-placement="stacked"
                type="date"
                :value="endDate"
                @ionInput="(e: CustomEvent) => (endDate = e.detail.value ?? '')"
              />
            </IonItem>
            <IonItem v-if="duration !== null" lines="none">
              <IonNote>{{ t('wizard.duration', { n: duration }) }}</IonNote>
            </IonItem>
            <IonItem>
              <IonSelect
                :label="t('wizard.series')"
                interface="popover"
                :value="seriesChoice"
                data-testid="wizard-series"
                @ionChange="(e: CustomEvent) => pickSeries(e.detail.value)"
              >
                <IonSelectOption value="">{{ t('wizard.seriesNone') }}</IonSelectOption>
                <IonSelectOption v-for="s in masterStore.seriesList" :key="s.id" :value="s.id">
                  {{ s.name }}
                </IonSelectOption>
                <IonSelectOption value="new">{{ t('wizard.seriesNew') }}</IonSelectOption>
              </IonSelect>
            </IonItem>
            <IonItem v-if="seriesChoice === 'new'">
              <IonInput
                :label="t('wizard.seriesName')"
                label-placement="stacked"
                :placeholder="t('wizard.seriesNamePlaceholder')"
                :value="newSeriesName"
                data-testid="wizard-series-name"
                @ionInput="(e: CustomEvent) => (newSeriesName = e.detail.value ?? '')"
              />
            </IonItem>
          </IonList>
          <h2 class="section-title jp-eyebrow">{{ t('wizard.sectionAttributes') }}</h2>
          <IonList>
            <IonItem>
              <IonSelect
                :label="t('wizard.season')"
                interface="popover"
                :value="season"
                @ionChange="(e: CustomEvent) => (season = e.detail.value)"
              >
                <IonSelectOption value="">{{ t('wizard.unset') }}</IonSelectOption>
                <IonSelectOption value="summer">{{ t('season.summer') }}</IonSelectOption>
                <IonSelectOption value="winter">{{ t('season.winter') }}</IonSelectOption>
                <IonSelectOption value="transitional">{{
                  t('season.transitional')
                }}</IonSelectOption>
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonSelect
                :label="t('wizard.transport')"
                interface="popover"
                :value="transportMode"
                @ionChange="(e: CustomEvent) => (transportMode = e.detail.value)"
              >
                <IonSelectOption value="">{{ t('wizard.unset') }}</IonSelectOption>
                <IonSelectOption value="car">{{ t('transport.car') }}</IonSelectOption>
                <IonSelectOption value="bike">{{ t('transport.bike') }}</IonSelectOption>
                <IonSelectOption value="plane">{{ t('transport.plane') }}</IonSelectOption>
                <IonSelectOption value="train">{{ t('transport.train') }}</IonSelectOption>
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonSelect
                :label="t('wizard.accommodation')"
                interface="popover"
                :value="accommodation"
                @ionChange="(e: CustomEvent) => (accommodation = e.detail.value)"
              >
                <IonSelectOption value="">{{ t('wizard.unset') }}</IonSelectOption>
                <IonSelectOption value="hotel">{{ t('accommodation.hotel') }}</IonSelectOption>
                <IonSelectOption value="holiday_flat">{{
                  t('accommodation.holiday_flat')
                }}</IonSelectOption>
                <IonSelectOption value="camping">{{ t('accommodation.camping') }}</IonSelectOption>
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonInput
                :label="t('wizard.tags')"
                label-placement="stacked"
                :placeholder="t('wizard.tagsPlaceholder')"
                :value="tagsInput"
                @ionInput="(e: CustomEvent) => (tagsInput = e.detail.value ?? '')"
              />
            </IonItem>
          </IonList>
        </template>
      </section>

      <!-- Step 2: travelers -->
      <section v-if="step === 2" data-testid="wizard-step-2">
        <h2 class="section-title jp-eyebrow">Travelers</h2>
        <IonList v-if="travelers.length > 0">
          <IonItem v-for="(traveler, index) in travelers" :key="index">
            <IonIcon slot="start" :icon="personOutline" />
            <IonInput
              data-testid="wizard-traveler-name"
              placeholder="Name"
              :value="traveler.name"
              @ionInput="(e: CustomEvent) => (traveler.name = e.detail.value ?? '')"
            />
            <IonButton
              slot="end"
              fill="clear"
              color="medium"
              data-testid="wizard-traveler-remove"
              aria-label="Remove traveler"
              @click="removeTraveler(index)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </IonItem>
        </IonList>
        <div v-else class="empty-hint">No travelers yet — per-person items need at least one.</div>
        <IonButton
          data-testid="wizard-add-traveler"
          fill="outline"
          size="small"
          @click="addTraveler"
        >
          <IonIcon slot="start" :icon="addOutline" />
          Add traveler
        </IonButton>

        <!-- Sharing & roles (FR-4.5/4.7) — OIDC sessions only (G-8) -->
        <template v-if="collaborative">
          <h2 class="section-title jp-eyebrow">Share with</h2>
          <IonList v-if="shares.length > 0">
            <IonItem v-for="(share, index) in shares" :key="share.userId">
              <IonLabel>{{ shareName(share.userId) }}</IonLabel>
              <IonSelect
                interface="popover"
                aria-label="Role"
                :value="share.role"
                @ionChange="(e: CustomEvent) => setShareRole(index, e.detail.value)"
              >
                <IonSelectOption value="editor">Editor</IonSelectOption>
                <IonSelectOption value="admin">Admin</IonSelectOption>
              </IonSelect>
              <IonButton
                slot="end"
                fill="clear"
                color="medium"
                aria-label="Remove share"
                @click="removeShare(index)"
              >
                <IonIcon slot="icon-only" :icon="closeOutline" />
              </IonButton>
            </IonItem>
          </IonList>
          <IonItem v-if="shareCandidates.length > 0" lines="none">
            <IonSelect
              interface="popover"
              placeholder="Add user…"
              aria-label="Add user"
              :value="null"
              @ionChange="(e: CustomEvent) => addShare(e.detail.value)"
            >
              <IonSelectOption v-for="u in shareCandidates" :key="u.user_id" :value="u.user_id">
                {{ u.display_name }}
              </IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonNote v-else-if="shares.length === 0" class="empty-hint">
            No other accounts on this server yet.
          </IonNote>
          <IonNote class="share-note">
            You stay the trip's Owner. Admins manage travelers and roles; Editors pack and comment
            (FR-4.5).
          </IonNote>
        </template>
      </section>

      <!-- Step 3: templates + preview -->
      <section v-if="step === 3" data-testid="wizard-step-3">
        <!-- FR-27.6: Ferien-Vorlagen first — they are what a trip starts from -->
        <template v-if="vacationTemplates.length > 0">
          <h2 class="section-title jp-eyebrow">{{ t('templates.sectionTemplates') }}</h2>
          <IonList data-testid="wizard-section-templates">
            <IonItem v-for="row in vacationTemplates" :key="row.template.id">
              <IonCheckbox
                slot="start"
                :data-testid="`wizard-pick-${row.template.id}`"
                :checked="selectedTemplateIds.has(row.template.id)"
                @ionChange="(e: CustomEvent) => toggleTemplate(row.template.id, e.detail.checked)"
              />
              <IonLabel>
                <h3>{{ row.template.name }}</h3>
                <p :data-testid="`wizard-count-${row.template.id}`">
                  {{ t('templates.itemCount', { n: row.count }) }}
                </p>
                <!-- FR-27.12: the row answers "was ist da drin?" for the easy case -->
                <p
                  v-if="row.preview.names.length"
                  class="preview"
                  :data-testid="`wizard-preview-${row.template.id}`"
                >
                  {{ previewText(row.preview) }}
                </p>
              </IonLabel>
              <button
                slot="end"
                class="peek"
                :data-testid="`wizard-peek-${row.template.id}`"
                :aria-label="t('templates.peekOpen', { name: row.template.name })"
                @click="peekTemplateId = row.template.id"
              >
                <IonIcon :icon="chevronForwardOutline" />
              </button>
            </IonItem>
          </IonList>
        </template>

        <template v-if="groupTemplates.length > 0">
          <h2 class="section-title jp-eyebrow">{{ t('wizard.sectionGroups') }}</h2>
          <IonList data-testid="wizard-section-groups">
            <IonItem v-for="row in groupTemplates" :key="row.template.id">
              <IonCheckbox
                slot="start"
                :data-testid="`wizard-pick-${row.template.id}`"
                :checked="selectedTemplateIds.has(row.template.id)"
                @ionChange="(e: CustomEvent) => toggleTemplate(row.template.id, e.detail.checked)"
              />
              <IonLabel>
                <h3>{{ row.template.name }}</h3>
                <p :data-testid="`wizard-count-${row.template.id}`">
                  {{ t('templates.itemCount', { n: row.count }) }}
                </p>
                <p
                  v-if="row.preview.names.length"
                  class="preview"
                  :data-testid="`wizard-preview-${row.template.id}`"
                >
                  {{ previewText(row.preview) }}
                </p>
                <!-- Already on the list through a picked Vorlage — say so -->
                <p
                  v-if="bringingVorlagen.has(row.template.id)"
                  :data-testid="`wizard-included-${row.template.id}`"
                >
                  {{
                    t('wizard.alreadyIncluded', {
                      names: bringingVorlagen.get(row.template.id)!.join(' & '),
                    })
                  }}
                </p>
              </IonLabel>
              <button
                slot="end"
                class="peek"
                :data-testid="`wizard-peek-${row.template.id}`"
                :aria-label="t('templates.peekOpen', { name: row.template.name })"
                @click="peekTemplateId = row.template.id"
              >
                <IonIcon :icon="chevronForwardOutline" />
              </button>
            </IonItem>
          </IonList>
        </template>

        <div v-if="masterStore.templateList.length === 0" class="empty-hint">
          {{ t('wizard.templatesEmpty') }}
        </div>

        <div class="preview-footer">
          <IonChip color="primary" outline data-testid="wizard-item-count">
            {{ t('templates.itemCount', { n: generation.items.length }) }}
          </IonChip>
          <!-- FR-20.2: required companions pulled in by dependencies -->
          <IonChip v-if="companionResolution.required.length > 0" color="secondary" outline>
            {{
              t('wizard.companions', {
                n: companionResolution.required.length,
                names: companionResolution.required.map((c) => c.name).join(', '),
              })
            }}
          </IonChip>
          <!-- FR-27.7: the preparation todos the trip inherits from its positions -->
          <IonChip v-if="taskCount > 0" outline data-testid="wizard-task-count">
            📋 {{ t('wizard.taskCount', { n: taskCount }) }}
          </IonChip>
          <!-- FR-27.2: a merge names its groups — the point of composing -->
          <div
            v-if="generation.merged.length > 0"
            class="preview-block"
            data-testid="wizard-merges"
          >
            <h3>{{ t('wizard.mergesTitle') }}</h3>
            <p v-for="(m, i) in generation.merged" :key="i">{{ mergeLine(m) }}</p>
          </div>
          <details v-if="generation.excluded.length > 0" class="preview-block">
            <summary>{{ t('wizard.excludedSummary', { n: generation.excluded.length }) }}</summary>
            <p v-for="(ex, i) in generation.excluded" :key="i">
              {{ t('wizard.excludedLine', { item: ex.item_name, reason: ex.reason }) }}
            </p>
          </details>
        </div>
      </section>

      <!-- Step 4: quantity review -->
      <section v-if="step === 4" data-testid="wizard-step-4">
        <h2 class="section-title jp-eyebrow">Review quantities</h2>
        <IonList v-if="generation.items.length > 0">
          <IonItem v-for="(item, index) in generation.items" :key="index">
            <IonLabel>
              <h3>{{ item.name }}</h3>
              <p>
                <template v-if="travelerName(item.traveler_index)"
                  >{{ travelerName(item.traveler_index) }} ·
                </template>
                <template v-if="item.category_name">{{ item.category_name }}</template>
              </p>
              <!-- FR-14.2: history hint "2024: 5 · 2025: 6 → suggested 6" -->
              <button
                v-if="suggestionFor(index)"
                type="button"
                class="history-hint"
                @click="acceptSuggestion(index)"
              >
                {{ suggestionHint(suggestionFor(index)!) }} → use
                {{ suggestionFor(index)!.suggested }}
              </button>
            </IonLabel>
            <IonInput
              slot="end"
              class="qty-input"
              type="number"
              min="0"
              :value="reviewQuantity(index)"
              aria-label="Quantity"
              @ionInput="(e: CustomEvent) => overrideQuantity(index, e.detail.value ?? '')"
            />
          </IonItem>
        </IonList>
        <div v-else class="empty-hint">No items generated — the trip starts empty.</div>

        <!-- FR-20.2/20.3: companions of on-list items join automatically -->
        <template
          v-if="companionResolution.required.length > 0 || companionResolution.deduped.length > 0"
        >
          <h2 class="section-title jp-eyebrow">Companion items</h2>
          <IonList v-if="companionResolution.required.length > 0">
            <IonItem v-for="c in companionResolution.required" :key="c.item_id">
              <IonLabel>
                <h3>{{ c.name }}</h3>
                <p>with {{ c.via_item_name }}</p>
              </IonLabel>
              <IonNote slot="end">×{{ c.quantity }}</IonNote>
            </IonItem>
          </IonList>
          <IonNote v-for="d in companionResolution.deduped" :key="d.item_id" class="dedup-note">
            {{ d.name }}: already on the list, not duplicated
          </IonNote>
        </template>

        <!-- FR-20.4: suggested companions, one tap each -->
        <template v-if="companionResolution.suggested.length > 0">
          <h2 class="section-title jp-eyebrow">Suggested companions</h2>
          <IonList>
            <IonItem v-for="s in companionResolution.suggested" :key="s.item_id">
              <IonCheckbox
                slot="start"
                :checked="acceptedSuggestions.has(s.item_id)"
                @ionChange="(e: CustomEvent) => toggleSuggestion(s.item_id, e.detail.checked)"
              />
              <IonLabel>
                <h3>{{ s.name }}</h3>
                <p>suggested with {{ s.via_item_name }}</p>
              </IonLabel>
              <IonNote slot="end">×{{ s.quantity }}</IonNote>
            </IonItem>
          </IonList>
        </template>

        <!-- FR-13.3: destination checklist offer from the series profile -->
        <template v-if="offeredChecklist.length > 0">
          <h2 class="section-title jp-eyebrow">Destination checklist</h2>
          <IonItem lines="none">
            <IonCheckbox
              slot="start"
              :checked="includeChecklist"
              @ionChange="(e: CustomEvent) => (includeChecklist = e.detail.checked)"
            />
            <IonLabel>
              Add {{ offeredChecklist.length }} item{{ offeredChecklist.length === 1 ? '' : 's' }}
              from the destination checklist
            </IonLabel>
          </IonItem>
          <IonNote>{{ offeredChecklist.map((c) => c.label).join(', ') }}</IonNote>
        </template>
      </section>

      <!-- Wizard navigation -->
      <div class="wizard-nav">
        <IonButton v-if="step > 1" data-testid="wizard-back" fill="outline" @click="back">
          Back
        </IonButton>
        <IonButton v-if="step < 4" data-testid="wizard-next" :disabled="!stepValid" @click="next">
          Next
        </IonButton>
        <IonButton
          v-if="step === 4"
          data-testid="wizard-create"
          color="primary"
          @click="createTrip"
        >
          Create trip
        </IonButton>
      </div>
      <!-- FR-27.12: look inside a group without losing the draft -->
      <SheetModal :is-open="peekTemplateId !== null" @dismiss="peekTemplateId = null">
        <GroupPeekSheet
          v-if="peekTemplateId"
          :template-id="peekTemplateId"
          @close="peekTemplateId = null"
        />
      </SheetModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.preview {
  color: var(--ct-overlay0);
}

.peek {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

/* FR-2.1c: one row standing in for every optional field. */
.more-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 14px 4px;
  margin-top: 4px;
  background: none;
  border: none;
  border-top: 1px solid var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  text-align: start;
  cursor: pointer;
}

.more-row .caret {
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-xs);
  transition: transform 0.18s ease;
}

.more-row.open .caret {
  transform: rotate(90deg);
}

.more-label {
  flex: none;
}

.more-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: end;
  font-weight: var(--jp-weight-medium);
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.section-title {
  margin: 16px 0 8px;
}

.empty-hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-base);
  margin: 8px 0 16px;
}

.share-note {
  display: block;
  font-size: var(--jp-text-sm);
  margin: 8px 0 16px;
}

.preview-footer {
  margin-top: 16px;
}

.preview-block {
  margin-top: 8px;
  font-size: var(--jp-text-base);
}

.preview-block h3,
.preview-block summary {
  font-size: var(--jp-text-base);
  font-weight: var(--jp-weight-semibold);
}

.dedup-note {
  display: block;
  font-size: var(--jp-text-sm);
  margin: 4px 0;
}

.preview-block p {
  margin: 2px 0;
  color: var(--ion-color-medium);
}

.qty-input {
  max-width: 72px;
  text-align: right;
}

.history-hint {
  margin-top: 4px;
  padding: 2px 8px;
  border: 1px solid var(--ion-color-primary);
  border-radius: var(--jp-r-md);
  background: transparent;
  color: var(--ion-color-primary);
  font-size: var(--jp-text-xs);
  cursor: pointer;
}

.wizard-nav {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
</style>
