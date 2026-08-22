<script setup lang="ts">
/**
 * M8 — Template Editor (§3.27, FR-27.6/27.7), rebuilt from the concept.
 *
 * The editor is **scope-shaped**: a Gruppe shows only *Positionen*; a
 * Ferien-Vorlage additionally shows *Gruppen* — whose picker offers groups
 * only, plus "Neue Gruppe anlegen…" inline — and a resolution footer that
 * states what the composition actually yields after dedup (FR-27.2).
 *
 * Adding a position is the packing list's quick-add, verbatim (FR-25.13,
 * §3.25 consistency directive); editing one is the M5-pattern bottom sheet
 * (PositionSheet). Every change commits immediately (G-5).
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
  IonInput,
  IonModal,
  toastController,
} from '@ionic/vue'
import {
  addOutline,
  chevronForwardOutline,
  closeOutline,
  cubeOutline,
  happyOutline,
} from 'ionicons/icons'
import { computed, inject, nextTick, ref } from 'vue'

import QuickAddItem from '@/components/global/QuickAddItem.vue'
import PositionSheet from '@/components/templates/PositionSheet.vue'
import GroupPeekSheet from '@/components/templates/GroupPeekSheet.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import MarkPicker from '@/components/items/MarkPicker.vue'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import {
  PICKER_SEARCH_MIN_GROUPS,
  matchGroupsInPositions,
  PREVIEW_ROW_NAMES,
  tripsReachedBy,
  previewLines,
  resolvedLines,
  scopeSwitchBlock,
  searchGroups,
} from '@/domain/templates'
import type { GroupMatch, GroupSearchCandidate } from '@/domain/templates'
import { foldDismissals } from '@/composables/useFoldDismissals'
import { t } from '@/i18n'
import { attributeLabel } from '@/lib/attributeLabels'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { TemplateItem, TemplateKind } from '@/types/domain'

const props = defineProps<{ templateId: string }>()

const masterStore = useMasterStore()
const tripStore = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const template = computed(() => masterStore.getTemplate(props.templateId))
const isGroup = computed(() => template.value?.kind === 'group')
const includes = computed(() => masterStore.getIncludes(props.templateId))
const includedBy = computed(() => masterStore.getIncludedBy(props.templateId))
const resolution = computed(() => masterStore.resolve(props.templateId))

const positions = computed(() =>
  [...masterStore.getTemplateItems(props.templateId)].sort((a, b) =>
    itemName(a.item_id).localeCompare(itemName(b.item_id)),
  ),
)

function itemName(itemId: string): string {
  return masterStore.getItem(itemId)?.name ?? t('templates.notFound')
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => template.value?.name ?? t('templates.notFound'))

async function toast(message: string, undo?: { text: string; handler: () => void }) {
  const el = await toastController.create({
    message,
    duration: 3000,
    position: 'bottom',
    // Above the FAB rather than behind the tab bar — the M4 anchor pattern.
    positionAnchor: 'm8-fab-anchor',
    buttons: undo ? [{ text: undo.text, role: 'undo', handler: undo.handler }] : undefined,
  })
  await el.present()
}

// --- Name (auto-saves on commit, G-5) --------------------------------------

function commitName(raw: string | null | undefined) {
  const name = (raw ?? '').trim()
  const tpl = template.value
  if (!tpl || !name || name === tpl.name) return
  orchestrator.updateTemplate(tpl, { name })
}

/** FR-28.8: a group's own mark, for the rows that offer it. */
function groupIcon(templateId: string): string | null {
  return masterStore.getTemplate(templateId)?.icon ?? null
}

// --- The mark (FR-28.8) ----------------------------------------------------
//
// The same field items carry, on the same terms — and not scope creep: the
// concept prototype has shown 📷 Makro Fotografie and ⛺ Camping Basis since
// §3.27, every one of them hardcoded in the mock.

const markPickerOpen = ref(false)

function setMark(next: string | null) {
  const tpl = template.value
  if (tpl) orchestrator.updateTemplate(tpl, { icon: next })
}

// --- Scope switch, guarded (FR-27.6) ---------------------------------------

async function switchScope(target: TemplateKind) {
  const tpl = template.value
  if (!tpl || tpl.kind === target) return
  const block = scopeSwitchBlock(target, includes.value, includedBy.value)
  if (block === 'has-includes') {
    await toast(t('templates.demoteBlocked'))
    return
  }
  if (block === 'included-by') {
    await toast(t('templates.includedBlocked', { name: includedBy.value[0]!.name }))
    return
  }
  orchestrator.updateTemplate(tpl, { kind: target })
}

const includedInLine = computed(() =>
  includedBy.value.length
    ? t('templates.includedIn', { names: includedBy.value.map((c) => c.name).join(', ') })
    : null,
)

// --- FR-27.4 blast radius ---------------------------------------------------

const reachedTrips = computed(() =>
  tripsReachedBy(
    props.templateId,
    {
      trips: tripStore.tripList,
      items: tripStore.tripList.flatMap((trip) => tripStore.getItems(trip.id)),
      includes: masterStore.includeList,
    },
    orchestrator.today(),
  ),
)

const blastNote = computed(() =>
  reachedTrips.value.length
    ? t('templates.blastRadius', {
        n: reachedTrips.value.length,
        names: reachedTrips.value.map((trip) => trip.name).join(', '),
      })
    : null,
)

// --- Gruppen section (Ferien-Vorlage only, FR-27.1) -------------------------

/** FR-27.12: which included group the peek sheet is showing, if any. */
const peekTemplateId = ref<string | null>(null)

/** The first few items of an included group, so the row says what it brought. */
function groupPreview(templateId: string): string {
  const lines = resolvedLines(masterStore.resolve(templateId), masterStore.itemList)
  const preview = previewLines(lines, PREVIEW_ROW_NAMES)
  const names = preview.names.join(' · ')
  return preview.rest > 0 ? `${names} ${t('templates.previewMore', { n: preview.rest })}` : names
}

const pickerOpen = ref(false)
const newGroupOpen = ref(false)
const newGroupName = ref('')
const newGroupInput = ref<InstanceType<typeof IonInput> | null>(null)

/** Groups only, never already-included ones — the two-level rule's picker. */
const availableGroups = computed(() => {
  const included = new Set(includes.value.map((inc) => inc.included_template_id))
  return masterStore.templateList
    .filter((tpl) => tpl.kind === 'group' && tpl.id !== props.templateId && !included.has(tpl.id))
    .sort((a, b) => a.name.localeCompare(b.name))
})

function groupName(includedTemplateId: string): string {
  return masterStore.getTemplate(includedTemplateId)?.name ?? t('templates.notFound')
}

function groupCount(includedTemplateId: string): number {
  return masterStore.resolve(includedTemplateId).positions.length
}

// --- FR-27.13: searching the picker ----------------------------------------

const pickerQuery = ref('')

/**
 * Every group the search can look at — the included ones too, flagged: they
 * are hidden while browsing and shown while searching, because a search that
 * silently drops them implies the group does not exist (FR-27.13).
 */
const searchCandidates = computed<GroupSearchCandidate[]>(() => {
  const included = new Set(includes.value.map((inc) => inc.included_template_id))
  return masterStore.templateList
    .filter((tpl) => tpl.kind === 'group' && tpl.id !== props.templateId)
    .map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      itemNames: resolvedLines(masterStore.resolve(tpl.id), masterStore.itemList).map(
        (line) => line.name,
      ),
      included: included.has(tpl.id),
    }))
})

/** The field appears only above six groups — below, scanning the chips wins. */
const pickerSearchable = computed(() => searchCandidates.value.length > PICKER_SEARCH_MIN_GROUPS)

const pickerSearching = computed(() => pickerSearchable.value && pickerQuery.value.trim() !== '')

/** Results as rows: the hit plus what the FR-27.12 summary line needs. */
const pickerHits = computed(() =>
  searchGroups(pickerQuery.value, searchCandidates.value).map((hit) => ({
    ...hit,
    name: groupName(hit.id),
    count: groupCount(hit.id),
    preview: groupPreview(hit.id),
  })),
)

function closePicker() {
  pickerOpen.value = false
  newGroupOpen.value = false
  newGroupName.value = ''
  pickerQuery.value = ''
}

function includeGroup(groupId: string) {
  orchestrator.addTemplateInclude(props.templateId, groupId)
  closePicker()
}

function removeInclude(includeId: string) {
  orchestrator.removeTemplateInclude(includeId)
}

/**
 * "Neue Gruppe anlegen…" — inline, so a missing block never detours via M7.
 * While searching, the field is prefilled with the query: a no-match search
 * ends in creation with the typed name (FR-27.13, keeping the M7 rule that no
 * row exists until a name does).
 */
function openNewGroup() {
  newGroupName.value = pickerQuery.value.trim()
  newGroupOpen.value = true
  // The field is v-if-gated, so it exists only after this tick.
  void nextTick(() => newGroupInput.value?.$el.setFocus())
}

async function commitNewGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  const groupId = orchestrator.createTemplate(name, 'group')
  orchestrator.addTemplateInclude(props.templateId, groupId)
  closePicker()
  await toast(t('templates.groupCreated', { name }))
}

// --- Positions --------------------------------------------------------------

const quickAdd = ref<InstanceType<typeof QuickAddItem> | null>(null)

/** Whether the composer is open — the ＋ has nothing to add while it is. */
const quickAddExpanded = computed(() => quickAdd.value?.expanded ?? false)

function openQuickAdd() {
  void quickAdd.value?.open()
}

/**
 * FR-25.13 in M8: a suggestion or a free-text name lands as a position with
 * the FR-25.7 defaults (qty 1, trip-global, Packen, dedup max). A name the
 * inventory does not know creates the master item first (FR-1.1); a name the
 * template already carries is reported, never added twice.
 */
async function onQuickAdd(entry: { name: string; sourceItemId: string | null }) {
  const name = entry.name.trim()
  const existing =
    entry.sourceItemId != null
      ? masterStore.getItem(entry.sourceItemId)
      : masterStore.itemList.find((i) => i.name.toLowerCase() === name.toLowerCase())
  const itemId = existing?.id ?? orchestrator.createMasterItem(name)

  if (positions.value.some((pos) => pos.item_id === itemId)) {
    await toast(t('templates.duplicate', { name: existing?.name ?? name }))
    return
  }
  orchestrator.addTemplateItem(props.templateId, itemId, { assignment: 'trip_global' })
  await toast(t('templates.added', { name: existing?.name ?? name }))
}

function removePosition(templateItemId: string) {
  orchestrator.deleteTemplateItem(templateItemId)
}

/** The collapsed row's summary chips; "Standard" when nothing deviates. */
function positionChips(pos: TemplateItem): string[] {
  const chips: string[] = []
  if (pos.assignment === 'per_person') chips.push(t('templates.perPerson'))
  if (pos.default_mode === 'buy_before') chips.push(t('mode.buyBefore'))
  if (pos.default_mode === 'buy_local') chips.push(t('mode.buyLocal'))
  if (pos.late_packer) chips.push(t('mode.latePacker'))
  const taskCount = masterStore.getTemplateItemTasks(pos.id).length
  if (taskCount) chips.push(t('templates.prepChip', { n: taskCount }))
  for (const value of Object.values(pos.conditions ?? {})) {
    if (typeof value === 'string') chips.push(attributeLabel(value))
  }
  return chips
}

// --- FR-27.15: a group hiding in the loose positions -------------------------

const dismissals = foldDismissals()

/**
 * The Gruppen this Vorlage has re-typed as own positions, minus the ones this
 * device was told to stop offering. Recomputing off the live positions is what
 * makes accepting one fold drop the candidates it subsumed — no bookkeeping.
 */
const groupMatches = computed<GroupMatch[]>(() => {
  if (isGroup.value) return []
  const included = new Set(includes.value.map((inc) => inc.included_template_id))
  const candidates = masterStore.templateList
    .filter((tpl) => tpl.kind === 'group' && tpl.id !== props.templateId)
    .map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      positions: masterStore.resolve(tpl.id).positions,
      included: included.has(tpl.id),
    }))
  return matchGroupsInPositions(positions.value, candidates).filter(
    (match) =>
      !dismissals.isDismissed(props.templateId, match.templateId, groupItemIds(match.templateId)),
  )
})

/** The group's resolved item set — what a dismissal is keyed to (FR-27.15). */
function groupItemIds(groupId: string): string[] {
  return masterStore.resolve(groupId).positions.map((pos) => pos.item_id)
}

/**
 * Zusammenfassen: the matched own positions go, the include arrives — the same
 * write path as picking the group in the picker, so the FR-27.4 blast-radius
 * note and the resolution footer apply unchanged. The snackbar's Rückgängig
 * restores exactly what was removed, deviations and FR-27.7 tasks included.
 */
async function foldGroup(match: GroupMatch) {
  const removed = match.positionIds
    .map((id) => positions.value.find((pos) => pos.id === id))
    .filter((pos): pos is TemplateItem => pos !== undefined)
    .map((pos) => ({
      pos,
      tasks: masterStore.getTemplateItemTasks(pos.id).map((task) => task.task),
    }))
  for (const entry of removed) orchestrator.deleteTemplateItem(entry.pos.id)
  const includeId = orchestrator.addTemplateInclude(props.templateId, match.templateId)

  await toast(t('templates.foldDone', { name: match.name, n: removed.length }), {
    text: t('templates.foldUndo'),
    handler: () => {
      orchestrator.removeTemplateInclude(includeId)
      for (const entry of removed) {
        const id = orchestrator.addTemplateItem(props.templateId, entry.pos.item_id, {
          quantity: entry.pos.quantity,
          assignment: entry.pos.assignment,
          dedup: entry.pos.dedup,
          defaultMode: entry.pos.default_mode,
          latePacker: entry.pos.late_packer,
          conditions: entry.pos.conditions,
        })
        for (const task of entry.tasks) orchestrator.addTemplateItemTask(id, task)
      }
      void toast(t('templates.foldUndone', { n: removed.length }))
    },
  })
}

/** Ignorieren: device-local, and re-offered once the group's set changes. */
function dismissMatch(match: GroupMatch) {
  dismissals.dismiss(props.templateId, match.templateId, groupItemIds(match.templateId))
}

// --- Position sheet (M5 pattern) --------------------------------------------

const openPositionId = ref<string | null>(null)

// --- Resolution footer (FR-27.2) --------------------------------------------

const mergeLines = computed(() =>
  resolution.value.merges.map((merge) =>
    t(merge.strategy === 'sum' ? 'templates.mergeSum' : 'templates.mergeMax', {
      name: itemName(merge.item_id),
      n: merge.quantity,
      groups: merge.sources.map((s) => s.name).join(' & '),
    }),
  ),
)
</script>

<template>
  <IonPage>
    <IonContent>
      <div v-if="!template" class="empty-state">
        <p>{{ t('templates.notFound') }}</p>
      </div>

      <template v-else>
        <div class="ion-padding head-block">
          <div class="name-line">
            <button
              class="mark-button"
              data-testid="m8-mark"
              :aria-label="t('marks.choose')"
              @click="markPickerOpen = true"
            >
              <ItemMark v-if="template.icon" :mark="template.icon" surface="plain" :size="28" />
              <IonIcon v-else :icon="happyOutline" aria-hidden="true" />
            </button>
            <IonInput
              :value="template.name"
              class="name-field"
              data-testid="m8-name"
              :aria-label="t('templates.namePlaceholder')"
              @ionBlur="
                (e: CustomEvent) => commitName((e.target as HTMLIonInputElement).value as string)
              "
              @keyup.enter="(e: KeyboardEvent) => (e.target as HTMLElement).blur()"
            />
          </div>

          <MarkPicker
            :is-open="markPickerOpen"
            :name="template.name"
            :current="template.icon ?? null"
            @pick="setMark"
            @close="markPickerOpen = false"
          />

          <!-- FR-27.6: the scope decides the editor's shape, so it is stated
               and switched before anything it shapes. -->
          <p class="sl scope-label">{{ t('templates.scopeLabel') }}</p>
          <div class="seg" role="group" data-testid="m8-scope-switch">
            <button
              :class="{ sel: isGroup }"
              :aria-pressed="isGroup"
              data-testid="m8-scope-group"
              @click="switchScope('group')"
            >
              {{ t('templates.sectionGroup') }}
            </button>
            <button
              :class="{ sel: !isGroup }"
              :aria-pressed="!isGroup"
              data-testid="m8-scope-template"
              @click="switchScope('template')"
            >
              {{ t('templates.sectionTemplate') }}
            </button>
          </div>
          <p v-if="isGroup && includedInLine" class="included-in" data-testid="m8-included-in">
            {{ includedInLine }}
          </p>

          <p v-if="blastNote" class="blast-note" data-testid="m8-blast-note">{{ blastNote }}</p>
        </div>

        <!-- Gruppen (Ferien-Vorlage only): included by reference, FR-27.1. -->
        <template v-if="!isGroup">
          <h2 class="section-head" data-testid="m8-groups-head">
            {{ t('templates.sectionGroups') }}
            <span class="section-count">{{ includes.length }}</span>
          </h2>

          <IonList v-if="includes.length" class="section-card jp-card">
            <IonItem
              v-for="inc in includes"
              :key="inc.id"
              :detail="false"
              :data-testid="`m8-group-${inc.included_template_id}`"
            >
              <!-- FR-28.8: the group's own mark where it has one; the generic
                   cube stays the fallback, because a group without a mark is
                   still a group and the column must not collapse. -->
              <ItemMark
                v-if="groupIcon(inc.included_template_id)"
                slot="start"
                :mark="groupIcon(inc.included_template_id)"
                surface="plain"
                :size="22"
                class="group-icon"
              />
              <IonIcon v-else :icon="cubeOutline" class="group-icon" slot="start" />
              <IonLabel>
                <h2>{{ groupName(inc.included_template_id) }}</h2>
                <p>{{ t('templates.itemCount', { n: groupCount(inc.included_template_id) }) }}</p>
                <!-- FR-27.12: the row says what it brought into this Vorlage -->
                <p
                  v-if="groupPreview(inc.included_template_id)"
                  class="preview"
                  :data-testid="`m8-group-preview-${inc.included_template_id}`"
                >
                  {{ groupPreview(inc.included_template_id) }}
                </p>
              </IonLabel>
              <button
                slot="end"
                class="peek"
                :aria-label="t('templates.peekOpen', { name: groupName(inc.included_template_id) })"
                :data-testid="`m8-group-peek-${inc.included_template_id}`"
                @click="peekTemplateId = inc.included_template_id"
              >
                <IonIcon :icon="chevronForwardOutline" />
              </button>
              <button
                slot="end"
                class="rm"
                :aria-label="t('templates.removeGroup')"
                :data-testid="`m8-group-remove-${inc.included_template_id}`"
                @click="removeInclude(inc.id)"
              >
                <IonIcon :icon="closeOutline" />
              </button>
            </IonItem>
          </IonList>
          <p v-else class="empty-hint" data-testid="m8-groups-empty">
            {{ t('templates.noGroups') }}
          </p>

          <!-- The picker: groups only, plus inline creation (FR-27.6). -->
          <div class="picker-zone">
            <button
              v-if="!pickerOpen"
              class="picker-trigger"
              data-testid="m8-include-open"
              @click="pickerOpen = true"
            >
              <IonIcon :icon="addOutline" />
              {{ t('templates.includeGroup') }}
            </button>

            <div v-else class="picker jp-card" data-testid="m8-group-picker">
              <!-- FR-27.13: the search — only above six groups, never focused. -->
              <IonInput
                v-if="pickerSearchable"
                :value="pickerQuery"
                class="picker-search"
                type="search"
                data-testid="m8-picker-search"
                :placeholder="t('templates.pickerSearchPlaceholder')"
                :aria-label="t('templates.pickerSearchPlaceholder')"
                @ionInput="(e: CustomEvent) => (pickerQuery = e.detail.value ?? '')"
              />

              <template v-if="!pickerSearching">
                <p v-if="availableGroups.length === 0" class="picker-empty">
                  {{ t('templates.allGroupsIncluded') }}
                </p>
                <button
                  v-for="group in availableGroups"
                  :key="group.id"
                  class="pick"
                  :data-testid="`m8-pick-${group.id}`"
                  @click="includeGroup(group.id)"
                >
                  ＋ {{ group.name }}
                </button>
              </template>

              <!-- FR-27.13: while searching, offers become rows carrying the
                   FR-27.12 summary — what you are about to include, visible
                   before you include it. -->
              <template v-else>
                <p
                  v-if="pickerHits.length === 0"
                  class="picker-empty"
                  data-testid="m8-search-empty"
                >
                  {{ t('templates.searchNoMatch', { query: pickerQuery.trim() }) }}
                </p>
                <template v-for="hit in pickerHits" :key="hit.id">
                  <button
                    v-if="!hit.included"
                    class="result"
                    :data-testid="`m8-pick-${hit.id}`"
                    @click="includeGroup(hit.id)"
                  >
                    <span class="result-head">
                      <span class="result-name">{{ hit.name }}</span>
                      <span class="result-count">{{
                        t('templates.itemCount', { n: hit.count })
                      }}</span>
                    </span>
                    <span v-if="hit.preview" class="preview">{{ hit.preview }}</span>
                    <span v-if="hit.via" class="result-via">{{
                      t('templates.matchedVia', { name: hit.via })
                    }}</span>
                  </button>
                  <div v-else class="result included" :data-testid="`m8-hit-included-${hit.id}`">
                    <span class="result-head">
                      <span class="result-name">{{ hit.name }}</span>
                      <span class="result-count">{{
                        t('templates.itemCount', { n: hit.count })
                      }}</span>
                    </span>
                    <span v-if="hit.preview" class="preview">{{ hit.preview }}</span>
                    <span v-if="hit.via" class="result-via">{{
                      t('templates.matchedVia', { name: hit.via })
                    }}</span>
                    <span class="result-included-note">{{ t('templates.alreadyIncluded') }}</span>
                  </div>
                </template>
              </template>

              <button
                v-if="!newGroupOpen"
                class="pick new"
                data-testid="m8-new-group"
                @click="openNewGroup"
              >
                ＋ {{ t('templates.newGroupInline') }}
              </button>
              <div v-else class="name-row">
                <IonInput
                  ref="newGroupInput"
                  :value="newGroupName"
                  class="inline-name"
                  data-testid="m8-new-group-name"
                  :placeholder="t('templates.namePlaceholder')"
                  :aria-label="t('templates.namePlaceholder')"
                  @ionInput="(e: CustomEvent) => (newGroupName = e.detail.value ?? '')"
                  @keyup.enter="commitNewGroup"
                />
                <button
                  class="pick commit"
                  data-testid="m8-new-group-commit"
                  :aria-disabled="!newGroupName.trim() || undefined"
                  @click="commitNewGroup"
                >
                  {{ t('templates.create') }}
                </button>
              </div>

              <button class="picker-close" :aria-label="t('common.close')" @click="closePicker">
                <IonIcon :icon="closeOutline" />
              </button>
            </div>
          </div>
        </template>

        <!-- FR-27.15: the editor noticed a Gruppe among the loose positions.
             Propose, never act — nothing changes until a tap, because a user
             who typed the positions loose may have meant it. -->
        <div
          v-for="match in groupMatches"
          :key="match.templateId"
          class="fold-hint jp-card"
          :data-testid="`m8-fold-${match.templateId}`"
        >
          <div class="fold-text">
            <p class="fold-head">
              {{ t('templates.foldSuggestion', { n: match.positionIds.length, name: match.name }) }}
            </p>
            <p
              v-if="match.deviations"
              class="fold-dev"
              :data-testid="`m8-fold-deviation-${match.templateId}`"
            >
              {{ t('templates.foldDeviation', { n: match.deviations }) }}
            </p>
          </div>
          <div class="fold-actions">
            <button
              class="fold-peek"
              :aria-label="t('templates.peekOpen', { name: match.name })"
              :data-testid="`m8-fold-peek-${match.templateId}`"
              @click="peekTemplateId = match.templateId"
            >
              <IonIcon :icon="chevronForwardOutline" />
            </button>
            <button
              class="fold-dismiss"
              :data-testid="`m8-fold-dismiss-${match.templateId}`"
              @click="dismissMatch(match)"
            >
              {{ t('templates.foldDismiss') }}
            </button>
            <button
              class="fold-accept"
              :data-testid="`m8-fold-accept-${match.templateId}`"
              @click="foldGroup(match)"
            >
              {{ t('templates.foldAccept') }}
            </button>
          </div>
        </div>

        <!-- Positions: a Gruppe's whole content, a Vorlage's own share. -->
        <h2 class="section-head" data-testid="m8-positions-head">
          {{ isGroup ? t('templates.positions') : t('templates.ownPositions') }}
          <span class="section-count">{{ positions.length }}</span>
        </h2>

        <IonList v-if="positions.length" class="section-card jp-card">
          <IonItem
            v-for="pos in positions"
            :key="pos.id"
            button
            :detail="false"
            :data-testid="`m8-position-${pos.id}`"
            @click="openPositionId = pos.id"
          >
            <IonLabel>
              <h2>{{ itemName(pos.item_id) }}</h2>
              <p v-if="positionChips(pos).length" class="chip-line">
                {{ positionChips(pos).join(' · ') }}
              </p>
              <p v-else class="chip-line standard">{{ t('templates.standardChip') }}</p>
            </IonLabel>
            <span slot="end" class="qty-chip jp-num">{{ pos.quantity }}×</span>
            <button
              slot="end"
              class="rm"
              :aria-label="t('templates.removePosition')"
              :data-testid="`m8-position-remove-${pos.id}`"
              @click.stop="removePosition(pos.id)"
            >
              <IonIcon :icon="closeOutline" />
            </button>
          </IonItem>
        </IonList>
        <p v-else class="empty-hint" data-testid="m8-positions-empty">
          {{ t('templates.noPositions') }}
        </p>

        <!-- FR-25.13, verbatim from the packing list; the confirm names the
             scope so the commit says where the position lands. -->
        <QuickAddItem
          ref="quickAdd"
          :confirm-label="isGroup ? t('templates.addToGroup') : t('templates.addToTemplate')"
          :exclude-item-ids="positions.map((pos) => pos.item_id)"
          @add="onQuickAdd"
        />

        <!-- FR-27.2: the footer names every merge — the merge is the
             user-visible point of the whole feature. -->
        <!-- FR-27.14: the line that states the count is the way into the list.
             It is a button because it acts, and because the count alone has
             answered "how many" and never "what" since the footer existed. -->
        <button
          v-if="!isGroup && includes.length"
          class="resolution jp-card"
          data-testid="m8-resolution"
          @click="peekTemplateId = props.templateId"
        >
          <p class="res-big">
            {{ t('templates.resolvedCount', { n: resolution.positions.length }) }}
          </p>
          <p class="res-line">
            {{ t('templates.groupCount', { n: includes.length }) }} +
            {{ t('templates.ownPositionCount', { n: positions.length }) }}
          </p>
          <p v-for="line in mergeLines" :key="line" class="res-merge" data-testid="m8-merge-line">
            {{ line }}
          </p>
          <p class="res-open" data-testid="m8-resolution-open">
            {{ t('templates.resolvedOpen', { n: resolution.positions.length }) }}
          </p>
        </button>

        <!-- FR-25.13a, amended 2026-08-17: the ＋ opens the quick-add, so it
             hides while the quick-add is open — there is nothing left for it to
             do, and the composer needs the space more than the button does. -->
        <IonFab id="m8-fab-anchor" vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton
            v-if="!quickAddExpanded"
            :aria-label="t('templates.addPosition')"
            data-testid="m8-fab"
            @click="openQuickAdd"
          >
            <IonIcon :icon="addOutline" />
          </IonFabButton>
        </IonFab>

        <!-- The M5-pattern sheet (§3.25 consistency directive). -->
        <IonModal
          :is-open="openPositionId !== null"
          class="sheet-modal"
          @did-dismiss="openPositionId = null"
        >
          <div class="sheet-box">
            <div class="grab" />
            <PositionSheet
              v-if="openPositionId"
              :template-id="props.templateId"
              :position-id="openPositionId"
              @close="openPositionId = null"
            />
          </div>
        </IonModal>

        <!-- FR-27.12: look into an included group without leaving the editor -->
        <SheetModal :is-open="peekTemplateId !== null" @dismiss="peekTemplateId = null">
          <GroupPeekSheet
            v-if="peekTemplateId"
            :template-id="peekTemplateId"
            @close="peekTemplateId = null"
          />
        </SheetModal>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.head-block {
  padding-bottom: 4px;
}

/* The name is the page title (ADR-011 header shows it too); here it is
   editable, quiet until touched. */
.name-field {
  --background: transparent;
  --padding-start: 0;
  font-size: var(--jp-text-2xl);
  font-weight: var(--jp-weight-bold);
  letter-spacing: var(--jp-tracking-display);
}

.sl {
  margin: 12px 0 6px;
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-semibold);
  letter-spacing: var(--jp-tracking-label);
  text-transform: uppercase;
  color: var(--ct-subtext0);
}

.seg {
  display: flex;
  gap: 6px;
}

.seg button {
  flex: 1;
  padding: 9px 10px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.seg button.sel {
  border-color: var(--jp-action);
  color: var(--jp-action);
  background: color-mix(in srgb, var(--jp-action) 10%, transparent);
}

.included-in {
  margin: 8px 0 0;
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

/* FR-27.4: a warning about reach, not an error — yellow, not red (G-11). */
.blast-note {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: var(--jp-r-md);
  background: color-mix(in srgb, var(--ct-yellow) 12%, transparent);
  color: var(--ct-yellow);
  font-size: var(--jp-text-xs);
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding: 18px 14px 8px;
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

.group-icon {
  color: var(--jp-brand);
  font-size: var(--jp-icon-md);
}

.chip-line {
  color: var(--ct-subtext0);
}

.chip-line.standard {
  color: var(--ct-overlay0);
}

.qty-chip {
  align-self: center;
  padding: 3px 9px;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.rm {
  display: grid;
  place-items: center;
  align-self: center;
  width: 30px;
  height: 30px;
  margin-inline-start: 4px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

.empty-hint {
  margin: 0 8px 8px;
  padding: 14px 16px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  text-align: center;
}

/* --- FR-27.15 fold suggestion ---
   A card in the action role rather than the brand one: it is an offer to
   change the composition, not a status the page is reporting. */
.fold-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0 8px 8px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--jp-action) 40%, transparent);
}

.fold-text {
  flex: 1 1 12rem;
}

.fold-head {
  margin: 0;
  color: var(--ct-text);
  font-size: var(--jp-text-sm);
}

.fold-dev {
  /* The blast-note's treatment, and for its reason: the flavour's yellow is
     legible on near-black and thin on near-white, so the warning carries its
     own wash rather than relying on the hue alone. */
  display: inline-block;
  margin: 6px 0 0;
  padding: 4px 8px;
  border-radius: var(--jp-r-sm);
  background: color-mix(in srgb, var(--ct-yellow) 16%, transparent);
  color: var(--ct-yellow);
  font-size: var(--jp-text-xs);
}

.fold-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fold-peek {
  display: flex;
  padding: 4px;
  border: none;
  background: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

.fold-dismiss,
.fold-accept {
  padding: 8px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.fold-accept {
  border-color: var(--jp-action);
  color: var(--jp-action);
}

/* --- group picker --- */
.picker-zone {
  margin: 0 8px 8px;
}

.picker-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: var(--ct-surface0);
  border: 1px dashed var(--ct-surface2);
  border-radius: var(--jp-r-sm);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-md);
  cursor: pointer;
}

.picker {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 40px 12px 14px;
}

.picker-empty {
  margin: 0;
  align-self: center;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.picker-search {
  width: 100%;
  --background: var(--ct-surface0);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-sm);
  margin-block-end: 4px;
}

.result {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-sm);
  background: none;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
  text-align: start;
  cursor: pointer;
}

.result .preview {
  font-size: var(--jp-text-sm);
}

.result.included {
  cursor: default;
  border-style: dashed;
}

.result-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.result-count {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  white-space: nowrap;
}

.result-via {
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
}

.result-included-note {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  font-style: italic;
}

.pick {
  padding: 8px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: none;
  color: var(--ct-text);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.pick.new {
  border-color: color-mix(in srgb, var(--jp-action) 50%, transparent);
  color: var(--jp-action);
}

.pick.commit {
  border-color: var(--jp-action);
  color: var(--jp-action);
}

.pick.commit[aria-disabled] {
  opacity: 0.5;
  pointer-events: none;
}

.picker-close {
  position: absolute;
  top: 8px;
  inset-inline-end: 8px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.inline-name {
  flex: 1;
  --background: var(--ct-surface0);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-sm);
}

/* --- resolution footer --- */
.resolution {
  display: block;
  width: 100%;
  text-align: start;
  border: none;
  font: inherit;
  cursor: pointer;
  margin: 8px 8px 96px;
  padding: 14px 16px;
}

.res-big {
  margin: 0;
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-bold);
}

.res-line {
  margin: 2px 0 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.res-merge {
  margin: 6px 0 0;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
}

.empty-state {
  display: flex;
  justify-content: center;
  padding: 24px;
  color: var(--ct-subtext0);
}

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

.res-open {
  margin: 8px 0 0;
  color: var(--jp-action);
}

/* --- the position sheet, in the app's sheet grammar --- */
.sheet-modal {
  --height: auto;
  --border-radius: var(--jp-r-lg) var(--jp-r-lg) 0 0;
  --background: var(--ct-mantle);
  --box-shadow: var(--jp-shadow-sheet);
  --backdrop-opacity: 0.62;
  align-items: flex-end;
}

.sheet-box {
  max-height: 85vh;
  overflow-y: auto;
}

.grab {
  width: 36px;
  height: 4px;
  margin: 10px auto 4px;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface1);
}

/* FR-28.8: the mark sits where the prototype always drew it — left of the
   name, at the same optical weight. The empty state is an outline icon, not
   a pale emoji: a mark is content, and chrome must not borrow its face. */
.name-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.name-line .name-field {
  flex: 1;
  min-width: 0;
}

.mark-button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: none;
  border: none;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-md);
  cursor: pointer;
}
</style>
