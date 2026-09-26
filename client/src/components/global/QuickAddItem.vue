<script setup lang="ts">
/**
 * Quick-add on the packing list (FR-5.6, FR-25.13/13a/13c).
 *
 * Collapsed by default and opened by M4's ＋ FAB, so the add path is one
 * tap from anywhere in the list rather than a target to scroll back to.
 * On M4 and M8 the FAB is the *only* way in (`showTrigger: false`,
 * FR-21.24): the collapsed pill sat above the list saying the same thing as
 * the FAB hovering over it, and a screen that offers one action twice has
 * to be read twice before it can be used once. M6, which has no FAB, is
 * where the pill is still the way in.
 * Opening does not focus the input (FR-25.13c): the
 * empty composer leads with a tappable row of recently used items, and an
 * auto-raised soft keyboard would cover it. Typing is one tap on the field
 * away.
 *
 * **The visible confirm button is the primary commit.** A phone has no
 * Enter key in reach, and leaving the action to the soft keyboard's
 * return key makes it invisible — this corrects the original design,
 * which was desktop thinking. Enter stays as the desktop shortcut.
 *
 * The form stays open after adding, because rows are entered in runs, and
 * it closes only when asked to: ✕, Escape, or the FAB again.
 *
 * M8 reuses this component verbatim (§3.25 consistency directive):
 * `confirmLabel` names the scope on the commit button
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
 * M4 also answers **for whom** here (FR-25.28, `travelerCount`): the
 * for-whom strip sits over the field, *Gemeinsam* stays the default for the
 * common case and a traveler is one tap away. The composer only carries the
 * chosen set on the `add` event — it knows nothing about rows — and no editor
 * follows the add: amounts are set on the child rows it produces. The strip
 * speaks for what the *composer* adds. The browse-sheet answers the same
 * question per line with its own 👥 and avatars (FR-25.13g/h), and one door
 * per surface is the rule, so a sheet add never reads the strip.
 *
 * **A name the inventory does not hold becomes an inventory item**
 * (FR-24.11): the composer searches with M9's rule, makes M9's offer
 * above its hits through the same `SearchOfferButton`, and takes it through the
 * same `CreateItemSheet`; what the sheet creates is then added like any pick.
 * The confirm button and Enter therefore add an exact match or open the sheet
 * — they never write a row nobody's inventory knows. An ad-hoc row would have
 * no tags, no weight and no second life on the next trip, and be the one add
 * on the screen that did not go through the inventory.
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
import { useRouter } from 'vue-router'

import { t } from '@/i18n'
import ForWhomToggles from '@/components/global/ForWhomToggles.vue'
import InventoryBrowseSheet from '@/components/global/InventoryBrowseSheet.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import CreateItemSheet from '@/components/items/CreateItemSheet.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import SearchOfferButton from '@/components/items/SearchOfferButton.vue'
import { useItemSearchCandidates } from '@/composables/useItemSearchCandidates'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { MIN_SEARCH_LENGTH, useMasterStore } from '@/stores/masterStore'
import {
  OFFER_CREATE,
  isSearchQuery,
  searchItems,
  searchOffer,
  type ItemSearchHit,
} from '@/domain/itemSearch'
import { searchEquals } from '@/domain/search'
import { itemPath } from '@/router/paths'
import { chipSuggestions } from '@/domain/quickAddChips'
import { MIN_TRAVELERS_FOR_PER_PERSON } from '@/domain/membership'
import { PREVIEW_ROW_NAMES, previewLines, resolvedLines } from '@/domain/templates'
import type { AddedItemDecision } from '@/sync/mutations'
import type { BrowseRowSummary } from '@/domain/browseRows'
import { recentItemIds, recordRecentItem } from '@/local/quickAddRecents'
import { previewText } from '@/lib/groupPreview'
import { formatWeight } from '@/lib/format'
import type { MasterItem, Traveler } from '@/types/domain'

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
    /**
     * FR-5.10: the packing is finished, so what is typed here is a thing that
     * travelled and was never listed — the caller adds it packed, and the
     * hint says so instead of FR-9.1's.
     */
    addsPacked?: boolean
    /**
     * FR-5.11: offer the two-way answer *packed* / *forgotten* — once the
     * packing is closed, when an add is a record of what happened rather than
     * a job. Absent in M8, which plans rather than remembers.
     */
    offerForgotten?: boolean
    /** Scope-labelled commit text (FR-25.13 in M8); icon-only when absent. */
    confirmLabel?: string
    /** Master items to keep out of the suggestions (already present). */
    excludeItemIds?: string[]
    /** FR-27.10: offer whole groups beside the items (M4 only). */
    offerGroups?: boolean
    /**
     * How many travelers the scope has. It decides two things at once, which
     * is why it is one number rather than two booleans: FR-25.8's for-whom
     * strip and FR-25.13g's „für alle" verb in the browse-sheet. A template has
     * no travelers (M8) and a trip travelling alone has no membership to
     * distribute either, so below {@link MIN_TRAVELERS_FOR_PER_PERSON} both are
     * absent rather than disabled (G-8).
     */
    travelerCount?: number
    /**
     * FR-25.13h: the roster itself, passed straight through to the
     * browse-sheet's avatar buttons and long-press menu. Absent wherever
     * {@link travelerCount} would keep the browse-sheet's 👥 off anyway.
     */
    travelers?: Traveler[]
    /**
     * FR-25.13f: the packing state of what the scope carries, per master
     * item. Passed straight through to the browse-sheet, where its presence
     * is what puts the two one-tap verbs on the rows — M4 only.
     */
    browseRowStates?: ReadonlyMap<string, BrowseRowSummary>
    /**
     * FR-21.24: whether the collapsed form shows its own trigger. M4 and M8
     * turn it off because their FAB is the same door, and the two stood on
     * the screen at once saying the same thing. M6 has no FAB and keeps the
     * pill, because otherwise the composer has no way in at all.
     */
    showTrigger?: boolean
  }>(),
  {
    isActive: false,
    addsPacked: false,
    offerForgotten: false,
    confirmLabel: undefined,
    excludeItemIds: () => [],
    offerGroups: false,
    travelerCount: 0,
    travelers: () => [],
    browseRowStates: undefined,
    showTrigger: true,
  },
)

/** The fields an add carries over, whichever verb sent it (FR-25.7 defaults). */
export interface BrowseAddition {
  name: string
  /** Always an inventory item (FR-24.11). */
  sourceItemId: string
  weightGrams: number | null
  valueCents: number | null
  categoryName: string | null
}

const emit = defineEmits<{
  /**
   * FR-25.13f: the second argument is the decision the browse-sheet's verbs
   * add with — absent on every other path, which is what "add it, open"
   * has always meant.
   */
  add: [
    /** FR-25.28's chosen travelers ride along — none means *gemeinsam*. */
    item: BrowseAddition & { travelerIds: string[] },
    decided?: AddedItemDecision,
  ]
  /** FR-27.10: expand this group onto the trip — the caller reports the result. */
  addGroup: [templateId: string]
  /**
   * FR-25.13g: add this master item with a row for every traveler. Its own
   * emit rather than the `add` above, because the sheet's lines carry their
   * own undo and the composer's adds do not.
   */
  addForAll: [item: BrowseAddition]
  /** FR-25.13g: give every traveler still without a row for it one. */
  spreadCarried: [itemId: string]
  /** FR-25.13h: add or update this master item with exactly this set of travelers assigned. */
  assignForTravelers: [item: BrowseAddition, travelerIds: string[]]
  /** FR-25.13f: pack every row the scope carries for this master item. */
  packCarried: [itemId: string]
  /** FR-25.13f: leave every row the scope carries for this master item home. */
  skipCarried: [itemId: string]
  /** FR-25.13f: take back what the sheet last did to this master item. */
  undoBrowse: [itemId: string]
  /**
   * FR-25.13i: put every row this master item has back to *open*, whenever it
   * was packed or skipped — not this run's undo, which only knows its own taps.
   */
  reopenCarried: [itemId: string]
}>()

const masterStore = useMasterStore()
const orchestrator = useOrchestrator()
const router = useRouter()
const candidates = useItemSearchCandidates()

const expanded = ref(false)
const query = ref('')

/**
 * FR-25.28: who the next add is for. It survives an add, because a run of
 * per-person rows is entered the same way a run of shared ones is, and it dies
 * with the composer: *gemeinsam* is the default, so the next opening starts
 * there. Insertion order is irrelevant — the planner sorts by roster.
 */
const chosenTravelers = ref<ReadonlySet<string>>(new Set())

/** FR-25.28: the strip is offered only where there is a membership to make (G-8). */
const offerForWhom = computed(() => props.travelers.length >= MIN_TRAVELERS_FOR_PER_PERSON)

/** Every composer add starts at one each; the amounts are the child rows' to change. */
const chosenAmounts = computed(() => new Map([...chosenTravelers.value].map((id) => [id, 1])))

/** The set as the `add` event carries it, in roster order. */
function chosenTravelerIds(): string[] {
  if (!offerForWhom.value) return []
  return props.travelers.filter((tr) => chosenTravelers.value.has(tr.id)).map((tr) => tr.id)
}

function toggleChosen(travelerId: string) {
  const next = new Set(chosenTravelers.value)
  if (!next.delete(travelerId)) next.add(travelerId)
  chosenTravelers.value = next
}

/** *Alle* only ever enlarges, as it does on a row (FR-25.21c). */
function chooseEveryone() {
  chosenTravelers.value = new Set(props.travelers.map((tr) => tr.id))
}
const inputRef = ref<InstanceType<typeof IonInput> | null>(null)

/**
 * The query's hits, by M9's rule (FR-24.7): both umlaut spellings, tags and
 * mark keywords, and ranked the way M9 ranks — so a name found in the
 * inventory is found here, and „nichts gefunden" means the same thing on both.
 */
const hits = computed<ItemSearchHit[]>(() =>
  isSearchQuery(query.value) ? searchItems(candidates.value, query.value) : [],
)

const suggestions = computed(() => {
  const excluded = new Set(props.excludeItemIds)
  return hits.value
    .filter((hit) => !excluded.has(hit.id))
    .slice(0, MAX_MATCHES)
    .flatMap((hit) => {
      const item = masterStore.getItem(hit.id)
      return item ? [{ item, via: hit.via }] : []
    })
})

/** The active item the query names exactly — what ✓ adds when there is one. */
const exactItem = computed(() => {
  const name = query.value.trim()
  if (!name) return undefined
  return masterStore.activeItemList.find((item) => searchEquals(item.name, name))
})

/** The exact match is already in the scope: nothing to add, and ✓ says so by resting. */
const exactAlreadyIn = computed(
  () => !!exactItem.value && props.excludeItemIds.includes(exactItem.value.id),
)

/**
 * FR-24.11's offer, made by M9's rule. Not before the master partition has
 * arrived (ADR-033): „no such item" is a claim about a list the device may
 * not hold yet, and taking it would create a duplicate of one it does.
 */
const offer = computed(() =>
  orchestrator.masterDataLoaded()
    ? searchOffer(query.value, masterStore.activeItemList, masterStore.retiredItemList)
    : null,
)

/** Whether ✓ has anything to do: add the exact match, or take the offer. */
const canCommit = computed(() => (exactItem.value ? !exactAlreadyIn.value : offer.value !== null))

/** Bumped after each record so the chip rows follow the trail (FR-25.13c). */
const recentsVersion = ref(0)

/**
 * FR-25.13c: the empty composer's recent-items chip row. `excludeItemIds`
 * doubles as the scope's contents, so what is already chosen is hidden.
 */
const chips = computed(() => {
  void recentsVersion.value
  return chipSuggestions({
    items: masterStore.activeItemList,
    chosenItemIds: props.excludeItemIds,
    recentItemIds: recentItemIds(),
  })
})

/** Chips yield to the autocomplete as soon as typing starts. */
const showChips = computed(() => query.value.trim().length === 0 && chips.value.recent.length > 0)

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
 * Opened by the FAB. Deliberately *without* focus (FR-25.13c): the
 * chips are the primary offer, and focusing would raise the soft keyboard
 * over them. The accepted cost is one extra tap for whoever wants to type.
 */
function open() {
  expanded.value = true
}

function close() {
  expanded.value = false
  query.value = ''
  chosenTravelers.value = new Set()
  forgotten.value = false
  browseOpen.value = false
  createOpen.value = false
}

function toggle() {
  if (expanded.value) close()
  else open()
}

/**
 * `expanded` is exposed, not only `open()`: the ＋ that opens this composer has
 * nothing left to do while it is open, and a control that does nothing is
 * worse than no control. The parent owns the FAB, so it
 * needs to see the state rather than guess it from its own bookkeeping.
 */
defineExpose({ open, expanded })

/**
 * What one master item becomes on the way to an add. Built once, because
 * FR-25.13g's „für alle" takes the same fields down a different action and a
 * second copy would be a second set of defaults.
 */
function additionOf(item: MasterItem) {
  return {
    name: item.name,
    sourceItemId: item.id,
    weightGrams: item.weight_grams,
    valueCents: item.value_cents,
    // The generated row carries one grouping key, which under FR-24.1 is
    // the master item's *primary* tag (FR-24.2) — the trip side keeps a
    // single snapshot, it does not gain the whole set.
    categoryName: masterStore.categoryOf(item.id),
  }
}

/** The bookkeeping every add from the sheet or the list leaves behind. */
function afterAdd(item: MasterItem) {
  recordRecentItem(item.id)
  recentsVersion.value++
  query.value = ''
}

/** A composer add: a chip or a suggestion, for whoever the strip names. */
function emitMasterItem(item: MasterItem) {
  // FR-5.11: a forgotten add is a record of one thing that stayed home, so it
  // never reads the strip — the same reason a browse-sheet add does not.
  if (forgottenOn.value) emit('add', { ...additionOf(item), travelerIds: [] }, 'forgotten')
  else emit('add', { ...additionOf(item), travelerIds: chosenTravelerIds() })
  afterAdd(item)
}

/**
 * A browse-sheet add. It never reads the strip: the sheet's lines answer *for
 * whom* themselves (FR-25.13g/h), and a tap there that also obeyed a control
 * the sheet is covering would be a decision nobody can see being made.
 */
function emitSheetItem(item: MasterItem, decided?: AddedItemDecision) {
  emit('add', { ...additionOf(item), travelerIds: [] }, decided)
  afterAdd(item)
}

/**
 * FR-25.13g: the sheet's „für alle". It never carries the FR-25.8 mode — the
 * verb *is* the answer to who gets it, and the caller distributes without an
 * editor, which is what keeps the run in the sheet.
 */
function onBrowseAddForAll(item: MasterItem) {
  emit('addForAll', additionOf(item))
  afterAdd(item)
}

/**
 * FR-25.13h: the sheet's per-traveler avatar buttons / long-press pick. Same
 * shape as {@link onBrowseAddForAll} for the same reason — the verb answers
 * who without an editor, so the run stays in the sheet. Multi-select: the
 * sheet always sends the whole desired set, not one traveler at a time.
 */
function onBrowseAssignForTravelers(item: MasterItem, travelerIds: string[]) {
  emit('assignForTravelers', additionOf(item), travelerIds)
  afterAdd(item)
}

function selectSuggestion(item: MasterItem) {
  emitMasterItem(item)
  // Stays open: rows are entered in runs, and a created or restored item
  // comes through here too, so every add leaves the composer the same way.
  void focusInput()
}

/**
 * FR-25.13c: a chip add stays in chip mode — no refocus, because the user
 * is tapping through an offer, and raising the keyboard would end that.
 */
function selectChip(item: MasterItem) {
  emitMasterItem(item)
}

/**
 * FR-5.11: the switch. A plain local `ref`, kept across adds because rows
 * are entered in runs („Sonnencreme, Ladekabel, Mütze"), and dropped when the
 * composer closes so the next visit starts from the ordinary add.
 */
const forgotten = ref(false)
const forgottenOn = computed(() => props.offerForgotten && forgotten.value)

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

/** A sheet add is a chip add: FR-25.7 defaults, no refocus, sheet stays open. */
function onBrowseAdd(item: MasterItem) {
  emitSheetItem(item)
}

/**
 * FR-25.13f: the same add, with the decision already made. It goes down the
 * add path rather than a second one, so a row born packed carries the same
 * defaults, the same recents entry and the same primary tag as any other.
 */
function onBrowseAddPacked(item: MasterItem) {
  emitSheetItem(item, 'packed')
}

function onBrowseAddSkipped(item: MasterItem) {
  emitSheetItem(item, 'skipped')
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
  if (browseFreeTextPending.value) {
    browseFreeTextPending.value = false
    void focusInput()
  }
}

// --- FR-24.11: what the search did not find, it creates ------------------

const createOpen = ref(false)

/**
 * Whether the sheet's dismissal should hand focus back to the field. Set by a
 * create, consumed on the sheet's dismissed signal: focusing while the sheet
 * is still tearing down loses to Ionic's focus restoration, which leaves the
 * page focused — Escape then no longer closes the composer. The browse-sheet's
 * footer line pays the same price the same way.
 */
const createFocusPending = ref(false)

/**
 * The tags of the items the query found *by name*, offered first in the
 * sheet, as M9 offers them: „Zelt" finds the pegs, so the tent is most likely
 * filed where they are.
 */
const preferredTagIds = computed(() => {
  const ids: string[] = []
  for (const hit of hits.value) {
    if (hit.reason !== 'name') continue
    for (const tag of masterStore.getItemTags(hit.id)) if (!ids.includes(tag.id)) ids.push(tag.id)
  }
  return ids
})

/**
 * The offer taken: a new name opens the sheet, a retired one is restored in
 * place (M23's restore) and added straight away — the item already has its
 * tags and its weight, so there is nothing left to ask.
 */
function takeOffer() {
  const current = offer.value
  if (!current) return
  if (current.kind === OFFER_CREATE) {
    createOpen.value = true
    return
  }
  if (!orchestrator.restoreMasterItem(current.id)) return
  const restored = masterStore.getItem(current.id)
  if (restored) selectSuggestion(restored)
}

/**
 * The sheet made the item, exactly as M9 and M10 make one; it is added like a
 * picked suggestion — for whoever the strip names. „Anlegen und öffnen"
 * continues in M10 after the add, so the row is there when the user returns.
 */
async function onCreated({ id, open }: { id: string; open: boolean }) {
  createFocusPending.value = !open
  createOpen.value = false
  const item = masterStore.getItem(id)
  if (!item) return
  emitMasterItem(item)
  if (open) await router.push(itemPath(id))
}

function onCreateDismiss() {
  createOpen.value = false
  if (createFocusPending.value) {
    createFocusPending.value = false
    void focusInput()
  }
}

/**
 * The confirm button and Enter. An exact match is added; any other name takes
 * the offer, which for a new name opens the sheet and never writes — a typo
 * must not become an item (FR-24.11).
 */
function commit() {
  if (!canCommit.value) return
  if (exactItem.value) selectSuggestion(exactItem.value)
  else takeOffer()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commit()
  }
  if (event.key === 'Escape') {
    close()
  }
}
</script>

<template>
  <div class="quick-add" :class="{ expanded }">
    <button
      v-if="!expanded && showTrigger"
      class="quick-add-trigger"
      data-testid="quick-add-open"
      @click="toggle"
    >
      <IonIcon :icon="addCircleOutline" />
      <span>{{ t('quickAdd.trigger') }}</span>
    </button>

    <div v-if="expanded" class="quick-add-form">
      <!-- FR-25.28: who the next add is for. The same line a row unfolds,
           holding a choice instead of rewriting rows. -->
      <div v-if="offerForWhom" class="for-whom" data-testid="quick-add-for-whom">
        <ForWhomToggles
          :travelers="travelers"
          :amounts="chosenAmounts"
          test-key="quick-add"
          @shared="chosenTravelers = new Set()"
          @all="chooseEveryone"
          @toggle="toggleChosen"
        />
        <p class="for-whom-summary" data-testid="quick-add-for-whom-summary">
          {{
            chosenTravelers.size > 0
              ? t('forWhom.addFor', { n: chosenTravelers.size })
              : t('forWhom.addShared')
          }}
        </p>
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
          :disabled="!canCommit"
          :aria-label="confirmLabel ?? t('common.add')"
          @click="commit"
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

      <!-- FR-5.11: after the packing closed an add answers *what happened*: it
           travelled unlisted (the default, as ever) or it stayed home. -->
      <div
        v-if="offerForgotten"
        class="add-choice"
        role="radiogroup"
        :aria-label="t('quickAdd.choiceLabel')"
        data-testid="quick-add-choice"
      >
        <button
          type="button"
          role="radio"
          class="add-choice-opt"
          :class="{ on: !forgotten }"
          :aria-checked="!forgotten"
          data-testid="quick-add-choice-packed"
          @click="forgotten = false"
        >
          {{ t('quickAdd.choicePacked') }}
          <small>{{ t('quickAdd.choicePackedSub') }}</small>
        </button>
        <button
          type="button"
          role="radio"
          class="add-choice-opt"
          :class="{ on: forgotten }"
          :aria-checked="forgotten"
          data-testid="quick-add-choice-forgotten"
          @click="forgotten = true"
        >
          {{ t('quickAdd.choiceForgotten') }}
          <small>{{ t('quickAdd.choiceForgottenSub') }}</small>
        </button>
      </div>

      <p v-if="forgottenOn || addsPacked || isActive" class="add-hint" data-testid="quick-add-hint">
        {{
          t(
            forgottenOn
              ? 'quickAdd.forgottenHint'
              : addsPacked
                ? 'quickAdd.packedHint'
                : 'quickAdd.missingHint',
          )
        }}
      </p>

      <!-- FR-25.13c: the empty composer offers chips before it asks for
           typing — the reason open() does not raise the keyboard. -->
      <div v-if="showChips" class="chip-rows" data-testid="quick-add-chips">
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

      <!-- FR-24.11: above the hits, the place M9 makes it — with the keyboard
           up, the end of a list of partial hits is out of reach. -->
      <SearchOfferButton
        v-if="offer"
        :offer="offer"
        testid="quick-add-offer"
        :create-hint="t('quickAdd.offerCreateHint')"
        :restore-hint="t('quickAdd.offerRestoreHint')"
        @take="takeOffer"
      />
      <p v-else-if="exactAlreadyIn" class="no-match" data-testid="quick-add-already-in">
        {{ t('quickAdd.alreadyIn', { name: exactItem?.name ?? '' }) }}
      </p>

      <IonList v-if="suggestions.length > 0" class="suggestions">
        <IonItem
          v-for="{ item, via } in suggestions"
          :key="item.id"
          button
          lines="inset"
          data-testid="quick-add-suggestion"
          @click="selectSuggestion(item)"
        >
          <IonLabel>
            <h3>{{ item.name }}</h3>
            <!-- FR-24.7: a hit the query does not visibly contain says why. -->
            <p v-if="via">{{ t('items.matchVia', { via }) }}</p>
            <p v-else-if="item.weight_grams">{{ formatWeight(item.weight_grams) }}</p>
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
          <!-- FR-28.8: the group's own mark where it has one; the generic
               glyph stays the fallback, so an unmarked group still reads as
               a group and not as an item. -->
          <ItemMark v-if="row.template.icon" :mark="row.template.icon" surface="plain" :size="22" />
          <IonIcon v-else :icon="albumsOutline" data-testid="quick-add-group-glyph" />
          <span class="group-text">
            <span class="group-name">{{ row.template.name }}</span>
            <span class="group-preview">{{ previewText(row.preview) }}</span>
          </span>
          <span class="group-count jp-num">{{ t('quickAdd.groupCount', { n: row.count }) }}</span>
        </button>
      </div>

      <SheetModal :is-open="browseOpen" @dismiss="onBrowseDismiss">
        <InventoryBrowseSheet
          :carried-item-ids="excludeItemIds"
          :row-states="browseRowStates"
          :traveler-count="travelerCount"
          :travelers="travelers"
          @add="onBrowseAdd"
          @add-for-all="onBrowseAddForAll"
          @assign-to-travelers="onBrowseAssignForTravelers"
          @spread-to-all="emit('spreadCarried', $event.id)"
          @add-packed="onBrowseAddPacked"
          @add-skipped="onBrowseAddSkipped"
          @pack="emit('packCarried', $event.id)"
          @skip="emit('skipCarried', $event.id)"
          @undo="emit('undoBrowse', $event.id)"
          @reopen="emit('reopenCarried', $event.id)"
          @free-text="onBrowseFreeText"
          @close="browseOpen = false"
        />
      </SheetModal>

      <!-- The form's last child, as in M10: Ionic moves a presented inline
           modal out of its parent, and a sheet with a sibling after it
           becomes Vue's insertion anchor for that sibling. -->
      <CreateItemSheet
        :is-open="createOpen"
        :name="offer?.name ?? query.trim()"
        :tag-ids="[]"
        :preferred-tag-ids="preferredTagIds"
        @dismiss="onCreateDismiss"
        @created="onCreated"
      />
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
  border: 1px solid var(--ct-glacier);
  border-radius: var(--jp-r-sm);
  padding: 8px;
}

.for-whom {
  margin-bottom: 8px;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.for-whom-summary {
  margin: 0;
  padding: 0 8px 6px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
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
  color: var(--ct-straw);
  margin: 4px 8px 0;
}

.add-choice {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 8px 8px 0;
  padding: 3px;
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-sunken);
}

.add-choice-opt {
  all: unset;
  box-sizing: border-box;
  padding: 6px 4px;
  border-radius: var(--jp-r-xs);
  text-align: center;
  color: var(--ct-text);
}

.add-choice-opt small {
  display: block;
  opacity: 0.75;
}

.add-choice-opt.on {
  background: var(--jp-surface-card);
  box-shadow: 0 0 0 1px var(--ct-straw);
}

.add-choice-opt:focus-visible {
  outline: 2px solid var(--ct-glacier);
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
     plane: inside this box, base would read as sunken in Nacht. */
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
