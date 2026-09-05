<script setup lang="ts">
/**
 * Quick-add on the packing list (FR-5.6, FR-25.13/13a/13c).
 *
 * Collapsed by default and opened by M4's ＋ FAB, so the add path is one
 * tap from anywhere in the list rather than a target to scroll back to.
 * Opening no longer focuses the input (FR-25.13c, owner 2026-08-21): the
 * empty composer leads with tappable chips — related to what the scope
 * already carries, and recently used — and an auto-raised soft keyboard
 * would cover exactly those. Typing is one tap on the field away.
 *
 * **The visible confirm button is the primary commit.** A phone has no
 * Enter key in reach, and leaving the action to the soft keyboard's
 * return key makes it invisible — this corrects the original design,
 * which was desktop thinking. Enter stays as the desktop shortcut.
 *
 * The form stays open after adding, because rows are entered in runs, and
 * it closes only when asked to: ✕, Escape, or the FAB again.
 *
 * M8 reuses this component verbatim (§3.25 consistency directive,
 * owner 2026-08-08): `confirmLabel` names the scope on the commit button
 * ("Zur Gruppe hinzufügen") and `excludeItemIds` keeps positions the
 * template already carries out of the suggestions — a duplicate is
 * reported by the caller, not offered again here.
 *
 * M4 additionally offers **whole groups** here (FR-27.10, `offerGroups`):
 * not every scope decision is made in the M3 wizard, and the alternative to
 * one tap is hand-copying a dozen positions. The spec's rule is that this
 * takes no new control — the composer the user already types into filters
 * groups beside items, under their own heading and visibly not an item.
 *
 * M4 also offers the **per-person mode** here (FR-25.8, `offerPerPerson`):
 * *Gesamt* stays the default for the common case and *Pro Person* is one tap
 * away. The composer only carries the choice on the `add` event — it knows
 * nothing about rows, and who gets how many is decided in the membership
 * editor the caller opens.
 *
 * **Deliberately no collapse-on-blur**, which FR-25.13a's wording allows
 * for an empty form. Collapsing removes a block from the flow *above* the
 * list, so the rows move between the pointer going down and coming up and
 * the browser dispatches no click at all — the first tap after adding an
 * item was swallowed, every time. An open form the user closes is better
 * than a list that ignores one tap in a place nobody would look for it.
 */
import { IonInput, IonList, IonItem, IonLabel, IonIcon, IonButton } from '@ionic/vue'
import {
  addCircleOutline,
  albumsOutline,
  checkmarkOutline,
  closeCircleOutline,
} from 'ionicons/icons'
import { ref, computed, nextTick } from 'vue'

import { t } from '@/i18n'
import InventoryBrowseSheet from '@/components/global/InventoryBrowseSheet.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { MIN_SEARCH_LENGTH, useMasterStore } from '@/stores/masterStore'
import { chipSuggestions } from '@/domain/quickAddChips'
import { PREVIEW_ROW_NAMES, previewLines, resolvedLines } from '@/domain/templates'
import type { AddedItemDecision } from '@/sync/mutations'
import type { BrowseRowSummary } from '@/domain/browseRows'
import { recentItemIds, recordRecentItem } from '@/local/quickAddRecents'
import { previewText } from '@/lib/groupPreview'
import type { MasterItem } from '@/types/domain'

/**
 * How many matches the composer offers per kind. The list sits under a soft
 * keyboard, and a sixth row is one nobody sees without scrolling away the
 * thing they are typing into.
 */
const MAX_MATCHES = 5

const props = withDefaults(
  defineProps<{
    /** M4's FR-9.1 hint: an add on an active trip flags the item Missing. */
    isActive?: boolean
    /** Scope-labelled commit text (FR-25.13 in M8); icon-only when absent. */
    confirmLabel?: string
    /** Master items to keep out of the suggestions (already present). */
    excludeItemIds?: string[]
    /** FR-27.10: offer whole groups beside the items (M4 only). */
    offerGroups?: boolean
    /**
     * FR-25.8: offer the *Pro Person* mode. The caller decides, because a
     * template has no travelers (M8) and neither has a trip with fewer than
     * two of them (G-8) — there is no membership to distribute.
     */
    offerPerPerson?: boolean
    /**
     * FR-25.13f: the packing state of what the scope carries, per master
     * item. Passed straight through to the browse-sheet, where its presence
     * is what puts the two one-tap verbs on the rows — M4 only.
     */
    browseRowStates?: ReadonlyMap<string, BrowseRowSummary>
  }>(),
  {
    isActive: false,
    confirmLabel: undefined,
    excludeItemIds: () => [],
    offerGroups: false,
    offerPerPerson: false,
    browseRowStates: undefined,
  },
)

const emit = defineEmits<{
  /**
   * FR-25.13f: the second argument is the decision the browse-sheet's verbs
   * add with — absent on every other path, which is what "add it, open"
   * has always meant.
   */
  add: [
    item: {
      name: string
      sourceItemId: string | null
      weightGrams: number | null
      valueCents: number | null
      categoryName: string | null
      /** FR-25.8: the add was made in *Pro Person* mode. */
      perPerson: boolean
    },
    decided?: AddedItemDecision,
  ]
  /** FR-27.10: expand this group onto the trip — the caller reports the result. */
  addGroup: [templateId: string]
  /** FR-25.13f: pack every row the scope carries for this master item. */
  packCarried: [itemId: string]
  /** FR-25.13f: leave every row the scope carries for this master item home. */
  skipCarried: [itemId: string]
  /** FR-25.13f: take back what the sheet last did to this master item. */
  undoBrowse: [itemId: string]
}>()

const masterStore = useMasterStore()

const expanded = ref(false)
const query = ref('')

/**
 * FR-25.8's mode. It survives an add, because a run of per-person rows is
 * entered the same way a run of shared ones is, and it dies with the composer:
 * *Gesamt* is the default the FR keeps, so the next opening starts there.
 */
const perPerson = ref(false)
const inputRef = ref<InstanceType<typeof IonInput> | null>(null)

const suggestions = computed(() => {
  if (query.value.length < MIN_SEARCH_LENGTH) return []
  const excluded = new Set(props.excludeItemIds)
  return masterStore
    .searchItems(query.value)
    .filter((i) => !excluded.has(i.id))
    .slice(0, MAX_MATCHES)
})

/** Bumped after each record so the chip rows follow the trail (FR-25.13c). */
const recentsVersion = ref(0)

/**
 * FR-25.13c: the empty composer's chip rows. `excludeItemIds` doubles as
 * the scope's contents, so what is already chosen is both the *context*
 * for the related row and hidden from every row.
 */
const chips = computed(() => {
  void recentsVersion.value
  return chipSuggestions({
    items: masterStore.activeItemList,
    chosenItemIds: props.excludeItemIds,
    recentItemIds: recentItemIds(),
    primaryTagOf: (itemId) => masterStore.getPrimaryTag(itemId),
  })
})

/** Chips yield to the autocomplete as soon as typing starts. */
const showChips = computed(
  () =>
    query.value.trim().length === 0 &&
    (chips.value.related.length > 0 || chips.value.recent.length > 0),
)

const relatedTagNames = computed(() => chips.value.relatedTags.map((tag) => tag.name).join(' · '))

/**
 * FR-27.10: the groups whose name the query matches, each with the FR-27.12
 * summary so the row answers "what is in there?" without being opened.
 *
 * Matched on the group's **name** alone, deliberately: searching the resolved
 * item names is FR-27.13's decided concept for the M8 picker, and building
 * half of it here would ship a second, quieter rule for the same question.
 */
const groupMatches = computed(() => {
  if (!props.offerGroups || query.value.length < MIN_SEARCH_LENGTH) return []
  const needle = query.value.trim().toLowerCase()
  return masterStore.activeTemplateList
    .filter((tpl) => tpl.kind === 'group' && tpl.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tpl) => {
      const lines = resolvedLines(masterStore.resolve(tpl.id), masterStore.itemList)
      return { template: tpl, count: lines.length, preview: previewLines(lines, PREVIEW_ROW_NAMES) }
    })
    .slice(0, MAX_MATCHES)
})

function selectGroup(templateId: string) {
  emit('addGroup', templateId)
  query.value = ''
  // Same stance as an item add: the composer stays open, because rows — and
  // groups — are entered in runs.
  void focusInput()
}

async function focusInput() {
  await nextTick()
  await inputRef.value?.$el?.setFocus()
}

/**
 * Opened by the FAB. Deliberately *without* focus since FR-25.13c: the
 * chips are the primary offer, and focusing would raise the soft keyboard
 * over them. The accepted cost is one extra tap for whoever wants to type.
 */
function open() {
  expanded.value = true
}

function close() {
  expanded.value = false
  query.value = ''
  perPerson.value = false
  browseOpen.value = false
  browsePerPersonPending.value = null
}

function toggle() {
  if (expanded.value) close()
  else open()
}

/**
 * `expanded` is exposed, not only `open()`: the ＋ that opens this composer has
 * nothing left to do while it is open, and a control that does nothing is
 * worse than no control (owner, 2026-08-17). The parent owns the FAB, so it
 * needs to see the state rather than guess it from its own bookkeeping.
 */
defineExpose({ open, expanded })

function emitMasterItem(item: MasterItem, decided?: AddedItemDecision) {
  emit(
    'add',
    {
      name: item.name,
      sourceItemId: item.id,
      weightGrams: item.weight_grams,
      valueCents: item.value_cents,
      // The generated row carries one grouping key, which since FR-24.1 is
      // the master item's *primary* tag (FR-24.2) — the trip side keeps a
      // single snapshot, it does not gain the whole set.
      categoryName: masterStore.getPrimaryTag(item.id)?.name ?? null,
      perPerson: perPerson.value,
    },
    decided,
  )
  recordRecentItem(item.id)
  recentsVersion.value++
  query.value = ''
}

function selectSuggestion(item: MasterItem) {
  emitMasterItem(item)
  // Stays open, like a free-text add: picking a suggestion is the same
  // act, and closing on one but not the other would be arbitrary.
  void focusInput()
}

/**
 * FR-25.13c: a chip add stays in chip mode — no refocus, because the user
 * is tapping through an offer, and raising the keyboard would end that.
 */
function selectChip(item: MasterItem) {
  emitMasterItem(item)
}

// --- Inventory browse-sheet (FR-25.13d) -------------------------------------

const browseOpen = ref(false)

/**
 * The sheet's door lives beside the chips, in the empty composer only:
 * typing means the user is in the *Erfassen* posture, and an inventory
 * with nothing in it has nothing to browse.
 */
const showBrowseEntry = computed(
  () => query.value.trim().length === 0 && masterStore.activeItemList.length > 0,
)

/**
 * A sheet add is a chip add: FR-25.7 defaults, no refocus, sheet stays open.
 *
 * **Except in *Pro Person* mode**, where the sheet has to close first. The add
 * ends in the membership editor, which is a modal of the caller's — and a modal
 * presented while this sheet is still up renders *behind* it, greyed and
 * unreachable. The emit therefore waits for the sheet's own dismissed signal,
 * the same reason the free-text line waits for it below. Found by rendering it.
 */
const browsePerPersonPending = ref<{ item: MasterItem; decided?: AddedItemDecision } | null>(null)

/**
 * Holds the add back until the sheet is gone. Every browse verb goes through
 * here in *Pro Person* mode, FR-25.13f's two included — the editor that
 * follows is the caller's modal either way.
 */
function deferPerPerson(item: MasterItem, decided?: AddedItemDecision) {
  browsePerPersonPending.value = { item, decided }
  browseOpen.value = false
}

function onBrowseAdd(item: MasterItem) {
  if (perPerson.value) {
    deferPerPerson(item)
    return
  }
  emitMasterItem(item)
}

/**
 * FR-25.13f: the same add, with the decision already made. It goes down the
 * add path rather than a second one, so a row born packed carries the same
 * defaults, the same recents entry and the same primary tag as any other.
 */
function onBrowseAddPacked(item: MasterItem) {
  if (perPerson.value) {
    deferPerPerson(item, 'packed')
    return
  }
  emitMasterItem(item, 'packed')
}

function onBrowseAddSkipped(item: MasterItem) {
  if (perPerson.value) {
    deferPerPerson(item, 'skipped')
    return
  }
  emitMasterItem(item, 'skipped')
}

/**
 * The footer line hands back to the composer's field — typing's one home.
 * The focus waits for the modal's own dismissed signal: focusing while the
 * sheet is still tearing down loses to Ionic's focus restoration.
 */
const browseFreeTextPending = ref(false)

function onBrowseFreeText() {
  browseFreeTextPending.value = true
  browseOpen.value = false
}

function onBrowseDismiss() {
  browseOpen.value = false
  const pending = browsePerPersonPending.value
  if (pending) {
    browsePerPersonPending.value = null
    emitMasterItem(pending.item, pending.decided)
    return
  }
  if (browseFreeTextPending.value) {
    browseFreeTextPending.value = false
    void focusInput()
  }
}

function submitFreeText() {
  const name = query.value.trim()
  if (!name) return

  emit('add', {
    name,
    sourceItemId: null,
    weightGrams: null,
    valueCents: null,
    categoryName: null,
    perPerson: perPerson.value,
  })
  query.value = ''
  void focusInput()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    submitFreeText()
  }
  if (event.key === 'Escape') {
    close()
  }
}
</script>

<template>
  <div class="quick-add" :class="{ expanded }">
    <button v-if="!expanded" class="quick-add-trigger" data-testid="quick-add-open" @click="toggle">
      <IonIcon :icon="addCircleOutline" />
      <span>{{ t('quickAdd.trigger') }}</span>
    </button>

    <div v-else class="quick-add-form">
      <!-- FR-25.8: the same two words the membership editor uses, because it
           is the editor this mode opens. -->
      <div v-if="offerPerPerson" class="seg" role="tablist">
        <button
          role="tab"
          :aria-selected="!perPerson"
          :class="{ on: !perPerson }"
          data-testid="quick-add-mode-shared"
          @click="perPerson = false"
        >
          {{ t('membership.shared') }}
        </button>
        <button
          role="tab"
          :aria-selected="perPerson"
          :class="{ on: perPerson }"
          data-testid="quick-add-mode-per-person"
          @click="perPerson = true"
        >
          {{ t('membership.perPerson') }}
        </button>
      </div>

      <div class="input-row">
        <IonInput
          ref="inputRef"
          v-model="query"
          data-testid="quick-add-input"
          :placeholder="t('quickAdd.placeholder')"
          :clear-input="true"
          @keydown="onKeydown"
        />
        <!-- The primary commit, and deliberately a button: see the header. -->
        <IonButton
          size="small"
          data-testid="quick-add-confirm"
          :disabled="!query.trim()"
          :aria-label="confirmLabel ?? t('common.add')"
          @click="submitFreeText"
        >
          <template v-if="confirmLabel">{{ confirmLabel }}</template>
          <IonIcon v-else slot="icon-only" :icon="checkmarkOutline" />
        </IonButton>
        <button
          class="close-btn"
          data-testid="quick-add-close"
          :aria-label="t('common.close')"
          @click="close"
        >
          <IonIcon :icon="closeCircleOutline" />
        </button>
      </div>

      <p v-if="isActive" class="add-hint">{{ t('quickAdd.missingHint') }}</p>

      <!-- FR-25.13c: the empty composer offers chips before it asks for
           typing — the reason open() no longer raises the keyboard. -->
      <div v-if="showChips" class="chip-rows" data-testid="quick-add-chips">
        <template v-if="chips.related.length > 0">
          <p class="chip-heading jp-eyebrow">
            {{ t('quickAdd.relatedHeading', { tags: relatedTagNames }) }}
          </p>
          <div class="chip-row">
            <button
              v-for="item in chips.related"
              :key="item.id"
              class="chip"
              data-testid="quick-add-chip-related"
              @click="selectChip(item)"
            >
              {{ item.name }}
            </button>
          </div>
        </template>
        <template v-if="chips.recent.length > 0">
          <p class="chip-heading jp-eyebrow">{{ t('quickAdd.recentHeading') }}</p>
          <div class="chip-row">
            <button
              v-for="item in chips.recent"
              :key="item.id"
              class="chip"
              data-testid="quick-add-chip-recent"
              @click="selectChip(item)"
            >
              {{ item.name }}
            </button>
          </div>
        </template>
      </div>

      <!-- FR-25.13d: the door to the browse-sheet — the *Zusammenstellen*
           posture, beside the chips' offers. -->
      <button
        v-if="showBrowseEntry"
        class="browse-entry"
        data-testid="quick-add-browse-open"
        @click="browseOpen = true"
      >
        <IonIcon :icon="albumsOutline" />
        <span>{{ t('quickAdd.browseEntry') }}</span>
      </button>

      <IonList v-if="suggestions.length > 0" class="suggestions">
        <IonItem
          v-for="item in suggestions"
          :key="item.id"
          button
          lines="inset"
          data-testid="quick-add-suggestion"
          @click="selectSuggestion(item)"
        >
          <IonLabel>
            <h3>{{ item.name }}</h3>
            <p v-if="item.weight_grams">
              {{
                item.weight_grams >= 1000
                  ? `${(item.weight_grams / 1000).toFixed(1)} kg`
                  : `${item.weight_grams} g`
              }}
            </p>
          </IonLabel>
        </IonItem>
      </IonList>

      <!-- FR-27.10: whole groups, rendered as cards rather than as list
           rows, so a tap that adds a dozen positions never looks like a tap
           that adds one item. -->
      <div v-if="groupMatches.length > 0" class="groups" data-testid="quick-add-groups">
        <p class="groups-heading jp-eyebrow">{{ t('quickAdd.groupsHeading') }}</p>
        <button
          v-for="row in groupMatches"
          :key="row.template.id"
          class="group-row"
          data-testid="quick-add-group"
          @click="selectGroup(row.template.id)"
        >
          <IonIcon :icon="albumsOutline" />
          <span class="group-text">
            <span class="group-name">{{ row.template.name }}</span>
            <span class="group-preview">{{ previewText(row.preview) }}</span>
          </span>
          <span class="group-count jp-num">{{ t('quickAdd.groupCount', { n: row.count }) }}</span>
        </button>
      </div>

      <p
        v-if="
          query.length >= MIN_SEARCH_LENGTH && suggestions.length === 0 && groupMatches.length === 0
        "
        class="no-match"
      >
        {{ t('quickAdd.newItem', { name: query }) }}
      </p>

      <SheetModal :is-open="browseOpen" @dismiss="onBrowseDismiss">
        <InventoryBrowseSheet
          :carried-item-ids="excludeItemIds"
          :row-states="browseRowStates"
          @add="onBrowseAdd"
          @add-packed="onBrowseAddPacked"
          @add-skipped="onBrowseAddSkipped"
          @pack="emit('packCarried', $event.id)"
          @skip="emit('skipCarried', $event.id)"
          @undo="emit('undoBrowse', $event.id)"
          @free-text="onBrowseFreeText"
          @close="browseOpen = false"
        />
      </SheetModal>
    </div>
  </div>
</template>

<style scoped>
.quick-add {
  padding: 8px 16px;
}

.quick-add-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: var(--ct-surface0);
  border: 1px dashed var(--ct-surface2);
  border-radius: var(--jp-r-sm);
  cursor: pointer;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-md);
}

.quick-add-trigger:active {
  background: var(--ct-surface1);
}

.quick-add-form {
  background: var(--ct-surface0);
  border: 1px solid var(--ct-blue);
  border-radius: var(--jp-r-sm);
  padding: 8px;
}

.seg {
  display: flex;
  gap: 3px;
  padding: 3px;
  margin-bottom: 8px;
  background: var(--jp-surface-sunken);
  border-radius: var(--jp-r-md);
}

.seg button {
  flex: 1;
  padding: 7px 4px;
  border: 0;
  border-radius: var(--jp-r-sm);
  background: none;
  color: var(--ct-subtext0);
}

.seg button.on {
  background: var(--jp-action);
  color: var(--ct-on-accent);
}

.input-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.input-row ion-input {
  flex: 1;
}

.close-btn {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-md);
  padding: 4px;
}

.suggestions {
  margin-top: 4px;
  background: transparent;
}

.chip-rows {
  margin-top: 4px;
  padding: 0 8px 4px;
}

.chip-heading {
  color: var(--ct-subtext0);
  margin: 8px 0 4px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  /* A step up from the composer's surface0, the group-row stance. */
  background: var(--ct-surface1);
  border: 1px solid var(--ct-surface2);
  border-radius: var(--jp-r-pill);
  padding: 6px 12px;
  cursor: pointer;
  color: var(--ct-text);
  font-size: var(--jp-text-sm);
}

.chip:active {
  background: var(--ct-surface2);
}

.browse-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 6px;
  padding: 10px 8px;
  background: none;
  border: none;
  border-top: 1px dashed var(--ct-surface2);
  cursor: pointer;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  text-align: left;
}

.browse-entry ion-icon {
  font-size: var(--jp-icon-sm);
}

.add-hint {
  font-size: var(--jp-text-xs);
  color: var(--ct-yellow);
  margin: 4px 8px 0;
}

.groups {
  margin-top: 8px;
}

.groups-heading {
  color: var(--ct-subtext0);
  margin: 0 8px 4px;
}

.group-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  /* A step *up* from the composer's own surface0, not the page's card
     plane: inside this box, base would read as sunken in Mocha. */
  background: var(--ct-surface1);
  border: 1px solid var(--ct-surface2);
  border-radius: var(--jp-r-sm);
  cursor: pointer;
  text-align: left;
  color: var(--ct-text);
}

.group-row + .group-row {
  margin-top: 4px;
}

.group-row:active {
  background: var(--ct-surface2);
}

.group-row ion-icon {
  font-size: var(--jp-icon-md);
  color: var(--jp-brand);
  flex-shrink: 0;
}

.group-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.group-name {
  font-size: var(--jp-text-md);
}

.group-preview {
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
  flex-shrink: 0;
}

.no-match {
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
  margin: 8px 8px 0;
}
</style>
