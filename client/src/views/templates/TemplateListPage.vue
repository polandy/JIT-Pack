<script setup lang="ts">
/**
 * M7 — Template List (§3.27, FR-27.6)
 *
 * One shared instance-wide list (FR-1.6 MVP simplification, 2026-08-08):
 * every account sees and edits every template, so there is no my/published
 * split and no publish toggle.
 *
 * The list is **scope-shaped**: *Alle · Ferien-Vorlagen · Gruppen*. Under
 * *Alle* the two scopes render as two sections with vacation templates first
 * — they are what a trip starts from, groups are the building blocks — and a
 * group row carries its chip so the scope is readable without the segment.
 *
 * Each row states its **resolved** set (own positions plus included groups,
 * deduped) rather than its raw position count: a composed template reading
 * "0 Artikel" describes the row, not the trip it would produce.
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonFab,
  IonFabButton,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonButton,
  IonInput,
  actionSheetController,
} from '@ionic/vue'
import {
  addOutline,
  briefcaseOutline,
  chevronForwardOutline,
  cubeOutline,
  documentTextOutline,
  downloadOutline,
  listOutline,
} from 'ionicons/icons'
import { computed, inject, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { serializeTemplate } from '@/domain/portable'
import { safeFilename, saveText } from '@/lib/download'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import type { Template, TemplateKind } from '@/types/domain'
import SearchRow from '@/components/global/SearchRow.vue'
import { useContextSearch } from '@/composables/useContextSearch'
import { setHeaderActions } from '@/composables/useHeaderActions'
import { t } from '@/i18n'

const store = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const router = useRouter()

/** The segment's third value is deliberately not a scope — it shows both. */
type ScopeTab = 'all' | TemplateKind
const tab = ref<ScopeTab>('all')

const {
  term: search,
  isOpen: searchOpen,
  toggle: toggleSearch,
  action,
  matches,
} = useContextSearch()
setHeaderActions(() => [action()])

/** One row's worth of view model — the resolution is computed once per row. */
interface TemplateRow {
  template: Template
  itemCount: number
  includes: Template[]
}

function toRow(template: Template): TemplateRow {
  const resolution = store.resolve(template.id)
  return {
    template,
    itemCount: resolution.positions.length,
    includes: resolution.includedTemplates,
  }
}

const visibleRows = computed(() =>
  store.templateList
    .filter((tpl) => matches(tpl.name))
    .filter((tpl) => tab.value === 'all' || tpl.kind === tab.value)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toRow),
)

const vacationRows = computed(() => visibleRows.value.filter((r) => r.template.kind === 'template'))
const groupRows = computed(() => visibleRows.value.filter((r) => r.template.kind === 'group'))

const isEmpty = computed(() => visibleRows.value.length === 0)
/** Nothing at all versus nothing *matching* — different sentences (G-7). */
const hasTemplates = computed(() => store.templateList.length > 0)

/** The sections shown under *Alle*; a single-scope tab renders one unlabelled list. */
const sections = computed(() =>
  tab.value === 'all'
    ? [
        {
          key: 'template' as const,
          label: t('templates.sectionTemplates'),
          rows: vacationRows.value,
        },
        { key: 'group' as const, label: t('templates.sectionGroups'), rows: groupRows.value },
      ].filter((s) => s.rows.length > 0)
    : [{ key: tab.value as TemplateKind, label: null, rows: visibleRows.value }],
)

// --- Creating (FR-27.6): the scope is chosen, never derived ---------------
//
// One sheet, one commit (owner decision 2026-08-15, variant pass): picking a
// scope reveals the name field in the same sheet instead of handing off to a
// system dialog — the explanation of what a Gruppe *is* stays on screen while
// you name one, and no row exists until the name does. The prototype's
// create-then-rename flow was rejected for exactly that second point: with
// real persistence it writes a "Neue Gruppe" row the moment you tap.

const kindChooserOpen = ref(false)
const pendingKind = ref<TemplateKind | null>(null)
const pendingName = ref('')
const nameInput = ref<InstanceType<typeof IonInput> | null>(null)

function chooseKind(kind: TemplateKind) {
  pendingKind.value = kind
  // The field is v-if-gated on the pick, so it exists only after this tick.
  nextTick(() => nameInput.value?.$el.setFocus())
}

function resetChooser() {
  kindChooserOpen.value = false
  pendingKind.value = null
  pendingName.value = ''
}

function commitCreate() {
  const kind = pendingKind.value
  const name = pendingName.value.trim()
  if (!kind || !name) return
  resetChooser()
  router.push(`/templates/${orchestrator.createTemplate(name, kind)}`)
}

// --- Row actions (FR-18.2): long-press / right-click menu ------------------
//
// Export lives behind a press-and-hold (owner decision 2026-08-15, variant
// pass; the spec's E2E-M7-04 shape): the row keeps only what identifies it,
// and the menu has room for the rename/delete the M8 rebuild will add.
// `contextmenu` covers desktop and is also the seam the e2e case drives.

const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP_PX = 8
let pressTimer: ReturnType<typeof setTimeout> | null = null
let pressOrigin: { x: number; y: number } | null = null
/**
 * Row taps are ignored while the menu lives. Set synchronously when the
 * hold fires — *before* the overlay attaches — and cleared on dismiss, so
 * the release-click of the hold cannot slip through in the attach window.
 * A state with a beginning and an end, rather than a "swallow the next
 * click" flag: the release usually produces no row click at all (up lands
 * on the overlay), and a one-shot flag would go stale and eat the next
 * legitimate tap instead.
 */
let rowMenuActive = false

function armLongPress(tpl: Template, ev: PointerEvent) {
  cancelLongPress()
  pressOrigin = { x: ev.clientX, y: ev.clientY }
  pressTimer = setTimeout(() => openRowMenu(tpl), LONG_PRESS_MS)
}

/** Scrolling is not holding: a finger that travels is moving the list. */
function trackLongPress(ev: PointerEvent) {
  if (!pressOrigin) return
  if (Math.hypot(ev.clientX - pressOrigin.x, ev.clientY - pressOrigin.y) > LONG_PRESS_SLOP_PX) {
    cancelLongPress()
  }
}

function cancelLongPress() {
  if (pressTimer !== null) clearTimeout(pressTimer)
  pressTimer = null
  pressOrigin = null
}

function openTemplate(tpl: Template) {
  if (rowMenuActive) return
  router.push(`/templates/${tpl.id}`)
}

async function openRowMenu(tpl: Template) {
  cancelLongPress()
  rowMenuActive = true
  try {
    const sheet = await actionSheetController.create({
      header: tpl.name,
      buttons: [
        {
          text: t('templates.export'),
          icon: downloadOutline,
          handler: () => exportTemplate(tpl),
        },
        { text: t('common.cancel'), role: 'cancel' },
      ],
    })
    await sheet.present()
    await sheet.onDidDismiss()
  } finally {
    // finally, not after the awaits: a failed present() must not leave the
    // list permanently tap-dead.
    rowMenuActive = false
  }
}

/** FR-18.2: client-side export — works identically in Local Mode. */
function exportTemplate(tpl: Template) {
  const yaml = serializeTemplate(tpl, store.getTemplateItems(tpl.id), (id) => store.getItem(id))
  saveText(yaml, `${safeFilename(tpl.name)}.yaml`)
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  refresher.complete()
}
</script>

<template>
  <IonPage>
    <IonContent>
      <SearchRow
        v-if="searchOpen || search"
        v-model="search"
        testid="templates-search-input"
        :placeholder="t('templates.searchPlaceholder')"
        @close="toggleSearch"
      />

      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <div class="ion-padding">
        <div class="title-row">
          <h1 class="page-title jp-page-title">{{ t('templates.title') }}</h1>
          <!-- M18: portable template import (FR-18.4) -->
          <IonButton
            fill="clear"
            size="small"
            :aria-label="t('templates.import')"
            router-link="/portable-import"
          >
            <IonIcon slot="icon-only" :icon="documentTextOutline" />
          </IonButton>
        </div>
      </div>

      <IonSegment
        v-if="hasTemplates"
        :value="tab"
        data-testid="m7-scope-segment"
        @ionChange="(e: CustomEvent) => (tab = e.detail.value as ScopeTab)"
      >
        <IonSegmentButton value="all" data-testid="m7-scope-all">
          <IonLabel>{{ t('common.all') }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton value="template" data-testid="m7-scope-template">
          <!-- The short form: at 390 px the full "Ferien-Vorlagen" truncates
               to an ellipsis, which names the scope worse than one word. The
               section head below carries the full name. -->
          <IonLabel>{{ t('templates.scopeTemplatesShort') }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton value="group" data-testid="m7-scope-group">
          <IonLabel>{{ t('templates.sectionGroups') }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <!-- Empty state (G-7) -->
      <div v-if="isEmpty" class="empty-state" data-testid="m7-empty">
        <IonIcon :icon="listOutline" class="empty-icon" />
        <p>{{ hasTemplates ? t('templates.noMatch') : t('templates.empty') }}</p>
        <p v-if="!hasTemplates" class="empty-hint">{{ t('templates.emptyHint') }}</p>
      </div>

      <template v-else>
        <template v-for="section in sections" :key="section.key">
          <h2 v-if="section.label" class="section-head" :data-testid="`m7-section-${section.key}`">
            {{ section.label }}
            <span class="section-count">{{ section.rows.length }}</span>
          </h2>

          <IonList class="section-card jp-card">
            <IonItem
              v-for="row in section.rows"
              :key="row.template.id"
              button
              :detail="false"
              :data-testid="`m7-row-${row.template.id}`"
              @click="openTemplate(row.template)"
              @contextmenu.prevent="openRowMenu(row.template)"
              @pointerdown="(e: PointerEvent) => armLongPress(row.template, e)"
              @pointermove="trackLongPress"
              @pointerup="cancelLongPress"
              @pointercancel="cancelLongPress"
            >
              <IonLabel>
                <h2>{{ row.template.name }}</h2>
                <p>
                  <template v-if="row.includes.length > 0">
                    {{ t('templates.groupCount', { n: row.includes.length }) }} ·
                  </template>
                  {{ t('templates.itemCount', { n: row.itemCount }) }}
                </p>
                <!-- FR-27.1: groups are referenced, so naming them here says
                     what the row is made of without opening it. -->
                <p v-if="row.includes.length > 0" class="contains">
                  {{ t('templates.contains') }}
                  {{ row.includes.map((g) => g.name).join(' · ') }}
                </p>
              </IonLabel>

              <span v-if="row.template.kind === 'group'" slot="end" class="scope-chip">
                {{ t('templates.groupChip') }}
              </span>
              <IonIcon slot="end" :icon="chevronForwardOutline" class="row-chevron" />
            </IonItem>
          </IonList>
        </template>
      </template>

      <IonFab vertical="bottom" horizontal="end" slot="fixed">
        <IonFabButton
          :aria-label="t('templates.new')"
          data-testid="m7-fab"
          @click="kindChooserOpen = true"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <!-- FR-27.6: the scope is declared at creation, so the FAB asks rather
           than defaulting — with one line each, because "Gruppe" alone does
           not say what it is for. -->
      <IonModal
        :is-open="kindChooserOpen"
        class="sheet-modal"
        data-testid="m7-kind-chooser"
        @did-dismiss="resetChooser"
      >
        <!-- A plain box, not an IonContent: inside an auto-height modal
             IonContent has no intrinsic height to give, so the sheet sized
             itself to nothing and swallowed the taps meant for the cards. -->
        <div class="sheet">
          <div class="grab" />
          <header class="head">
            <h2>{{ t('templates.new') }}</h2>
            <p class="head-hint">{{ t('templates.newQuestion') }}</p>
          </header>

          <button
            class="kind-card jp-card"
            :class="{ picked: pendingKind === 'template' }"
            data-testid="m7-kind-template"
            @click="chooseKind('template')"
          >
            <IonIcon :icon="briefcaseOutline" class="kind-icon" />
            <span class="kind-name">{{ t('templates.sectionTemplate') }}</span>
            <span class="kind-hint">{{ t('templates.templateHint') }}</span>
          </button>

          <button
            class="kind-card jp-card"
            :class="{ picked: pendingKind === 'group' }"
            data-testid="m7-kind-group"
            @click="chooseKind('group')"
          >
            <IonIcon :icon="cubeOutline" class="kind-icon" />
            <span class="kind-name">{{ t('templates.sectionGroup') }}</span>
            <span class="kind-hint">{{ t('templates.groupHint') }}</span>
          </button>

          <!-- The name appears once a scope is picked — same surface, one
               commit, and nothing is written until it happens. -->
          <div v-if="pendingKind" class="name-row">
            <IonInput
              ref="nameInput"
              :value="pendingName"
              :placeholder="t('templates.namePlaceholder')"
              class="name-field"
              data-testid="m7-name-field"
              :aria-label="t('templates.namePlaceholder')"
              @ionInput="(e: CustomEvent) => (pendingName = e.detail.value ?? '')"
              @keyup.enter="commitCreate"
            />
            <IonButton
              :disabled="!pendingName.trim()"
              data-testid="m7-create-commit"
              @click="commitCreate"
            >
              {{ t('templates.create') }}
            </IonButton>
          </div>
        </div>
      </IonModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-title {
  margin: 16px 0 16px;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

ion-segment {
  margin: 0 12px 4px;
}

/* The section heading outranks the rows it heads — the same relation the
   M4 group head states, so the two lists read alike. */
.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding: 20px 14px 8px;
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-bold);
  letter-spacing: var(--jp-tracking-display);
}

.section-count {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-medium);
}

.section-card {
  margin: 0 8px 8px;
}

.contains {
  color: var(--ct-subtext0);
}

/* A scope label, not an action — it states what the row is, so it stays
   quieter than the export button beside it. */
.scope-chip {
  align-self: center;
  padding: 2px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.row-chevron {
  align-self: center;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-sm);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--ion-color-medium);
}

.empty-icon {
  font-size: var(--jp-icon-2xl);
  margin-bottom: 16px;
}

.empty-hint {
  font-size: var(--jp-text-sm);
  margin-top: 8px;
}

/* --- The create chooser, in the app's sheet grammar (see FilterSheet) --- */
.sheet-modal {
  --height: auto;
  --border-radius: var(--jp-r-lg) var(--jp-r-lg) 0 0;
  --background: var(--ct-mantle);
  --box-shadow: var(--jp-shadow-sheet);
  --backdrop-opacity: 0.62;
  align-items: flex-end;
}

.sheet {
  padding: 0 16px 24px;
}

.grab {
  width: 36px;
  height: 4px;
  margin: 10px auto 4px;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface1);
}

.head h2 {
  margin: 8px 0 2px;
}

.head-hint {
  margin: 0 0 12px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.kind-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  width: 100%;
  margin-bottom: 10px;
  padding: 14px 16px;
  border: none;
  text-align: start;
  color: var(--ct-text);
  cursor: pointer;
}

.kind-icon {
  grid-row: 1 / span 2;
  align-self: center;
  font-size: var(--jp-icon-lg);
  color: var(--jp-brand);
}

.kind-card.picked {
  outline: 2px solid var(--jp-action);
}

/* The pick has to survive the eye moving down to the field: the outline
   alone read as "too quiet" in the variant render, so the icon answers in
   the action colour too. */
.kind-card.picked .kind-icon {
  color: var(--jp-action);
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.name-field {
  flex: 1;
  --background: var(--ct-surface0);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-sm);
}

.kind-name {
  font-weight: var(--jp-weight-semibold);
}

.kind-hint {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}
</style>
