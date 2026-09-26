<script setup lang="ts">
/**
 * M6 — the shopping list (FR-3.2, FR-30).
 *
 * Two lists, *Vor der Reise* and *Vor Ort*, each read from every source
 * the composition root provides (`lib/shoppingSources.ts`) plus the list's
 * own entries. What a line *is* — a packing row bought rather than packed, or
 * „Milch" typed here — is its source's business; this screen renders lines,
 * checks them off and puts them back, and never learns which. That is the
 * module boundary of FR-30.3 (ADR-066): nothing here imports packing code,
 * and a packing line's check-off writes FR-3.3/FR-25.11j through the write
 * its source bound into it.
 *
 * **Read as M25 reads a trip's tasks** (one look and feel for the two
 * lists): the composer on top, then what is due now across both lists, then
 * each list as a section with its tag groups and one *gekauft* fold. Both
 * lists stand on one screen so a thing due tomorrow on either is seen.
 *
 * The composer adds an entry of the list's own: it is on the shopping list
 * alone and counts towards no packing figure. Adding a packing row in a buy
 * mode is the packing list's job (M4), where the item and its mode are chosen.
 */
import { IonPage, IonContent, IonIcon, IonFab, IonFabButton } from '@ionic/vue'
import { addOutline, bagHandleOutline, pricetagsOutline } from 'ionicons/icons'
import { computed, inject, onMounted, reactive, ref, watch } from 'vue'

import BulkBar from '@/components/global/BulkBar.vue'
import ChipRow from '@/components/global/ChipRow.vue'
import ChoiceChip from '@/components/global/ChoiceChip.vue'
import DueBlock from '@/components/global/DueBlock.vue'
import DueChips from '@/components/global/DueChips.vue'
import EmptyState from '@/components/global/EmptyState.vue'
import EntrySheet from '@/components/global/EntrySheet.vue'
import InlineHint from '@/components/global/InlineHint.vue'
import ListComposer from '@/components/global/ListComposer.vue'
import RestLine from '@/components/global/RestLine.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { useDragToGroup, type DropPlace } from '@/composables/useDragToGroup'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderSelection } from '@/composables/useHeaderSelection'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { SELECTION_ICON, useRowSelection } from '@/composables/useRowSelection'
import { useTripScreen } from '@/composables/useTripScreen'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { collapseRow } from '@/lib/rowCollapse'
import { presentToast } from '@/lib/toast'
import { SHOPPING_SOURCES, type ShoppingLine } from '@/lib/shoppingSources'
import type { ShoppingMode } from '@/types/domain'
import {
  ITEM_MODE_BUY_BEFORE,
  ITEM_MODE_BUY_LOCAL,
  SHOPPING_MODES,
  TASK_PHASE_BEFORE,
  TASK_PHASE_DURING,
  TRIP_STATUS_PLANNING,
} from '@/types/domain'
import { isPackingClosed } from '@/lib/tripPhase'
import { createShoppingActions, ownEntriesSource } from './actions'
import { dropTag, listInFocus, shoppingBoard, type ShoppingSection } from './list'
import ShoppingListSection from './ShoppingListSection.vue'
import ShoppingRows from './ShoppingRows.vue'
import ShoppingTagChooser from './ShoppingTagChooser.vue'
import { useShoppingStore } from './store'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const shoppingStore = useShoppingStore()
const actions = createShoppingActions(orchestrator.moduleHost)
const own = ownEntriesSource(shoppingStore, actions)
// Absent in a spec that provides none: the list still works on its own.
const sources = inject(SHOPPING_SOURCES, [])

// ADR-033: whether this trip's rows are here — the entries travel the same
// partition as the packing rows. „Nothing to buy" is a sentence somebody
// leaves the house on, and a partition still in flight is not it.
const { trip, loaded: rowsLoaded, ensure } = useTripScreen(props.tripId, orchestrator)

/**
 * FR-7.12: once the packing is finished *before departure* is over — its list
 * stays readable as the record of what was bought, folded at the end of the
 * screen as M25 folds its *before*, and takes nothing new: no entry, no
 * purchase put back onto it. Reopening the packing lifts it (FR-5.10).
 */
const beforeLocked = computed(() => isPackingClosed(trip.value))

/**
 * Whether a new entry may still be for *before departure* (FR-30.8's rule):
 * only while the trip is planned and its packing open. Until the trip itself
 * is on the device, *Vor der Reise* is the answer that cannot be wrong.
 */
const beforeOpen = computed(
  () =>
    !trip.value ||
    listInFocus({
      planned: trip.value.status === TRIP_STATUS_PLANNING,
      packingClosed: isPackingClosed(trip.value),
    }) === ITEM_MODE_BUY_BEFORE,
)

// FR-30.4: a purchase is named from the trip's participants, the way every
// other stamp on the trip is — empty in Local Mode, where nobody is named.
const { nameOf, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)
onMounted(async () => {
  await ensure()
  await loadIdentity()
})

function openLines(list: ShoppingMode) {
  return {
    own: own.open(props.tripId, list),
    sourced: sources.flatMap((source) => source.open(props.tripId, list)),
  }
}

function boughtLines(list: ShoppingMode): ShoppingLine[] {
  return [
    ...own.bought(props.tripId, list),
    ...sources.flatMap((source) => source.bought(props.tripId, list)),
  ]
}

/** Today as the device reckons it — what a due day is read against (FR-30.10). */
const today = computed(() => orchestrator.today())
const board = computed(() =>
  shoppingBoard(
    {
      [ITEM_MODE_BUY_BEFORE]: openLines(ITEM_MODE_BUY_BEFORE),
      [ITEM_MODE_BUY_LOCAL]: openLines(ITEM_MODE_BUY_LOCAL),
    },
    today.value,
  ),
)
const bought = computed(() => ({
  [ITEM_MODE_BUY_BEFORE]: boughtLines(ITEM_MODE_BUY_BEFORE),
  [ITEM_MODE_BUY_LOCAL]: boughtLines(ITEM_MODE_BUY_LOCAL),
}))

/** Whether any packing line is open, on either list — what the two hints below name. */
const hasSourced = computed(() =>
  SHOPPING_MODES.some((list) =>
    sources.some((source) => source.open(props.tripId, list).length > 0),
  ),
)

/** How many of a list's open lines stand in the *Fällig* block. */
function dueIn(list: ShoppingMode): number {
  return board.value.due.filter((line) => board.value.listOf(line.key) === list).length
}

/** Nothing open and nothing bought, on either list: the screen's empty state (G-7). */
const nothingAtAll = computed(
  () =>
    board.value.due.length === 0 &&
    SHOPPING_MODES.every(
      (list) => board.value.lists[list].open === 0 && bought.value[list].length === 0,
    ),
)

/** A line in the *Fällig* block stands outside its group, so its row names it. */
function tagOfDue(line: ShoppingLine): string | null {
  if (line.tag) return line.tag
  return line.edit ? t('shopping.ownEntries') : t('shopping.packingList')
}

/** FR-7.12: the finished packing's *before* — the record of what was bought. */
function isClosed(list: ShoppingMode): boolean {
  return list === ITEM_MODE_BUY_BEFORE && beforeLocked.value
}

/**
 * M25 alike: a list with nothing open under its heading leaves reading order
 * for one line at the end rather than taking a heading's worth of room above
 * the one still being worked, as the closed *before* does — also while its last open lines stand in the
 * *Fällig* block, which is where they are read (the line counts them).
 */
function inOrder(list: ShoppingMode): boolean {
  return !isClosed(list) && board.value.lists[list].open > 0
}

const restLists = computed(() => SHOPPING_MODES.filter((list) => !inOrder(list)))
const restOpen = reactive<Record<ShoppingMode, boolean>>({
  [ITEM_MODE_BUY_BEFORE]: false,
  [ITEM_MODE_BUY_LOCAL]: false,
})

/** *„Vor der Reise · nichts offen · 2 gekauft"* (*„· 1 fällig"* while the block holds some) — or the closed *before*'s own words. */
function restLabel(list: ShoppingMode): string {
  const n = bought.value[list].length
  if (isClosed(list)) {
    return n > 0 ? t('shopping.beforeHistory', { n }) : t('shopping.beforeHistoryEmpty')
  }
  const name = t(
    list === ITEM_MODE_BUY_BEFORE ? 'shopping.beforeDeparture' : 'shopping.atDestination',
  )
  const due = dueIn(list)
  if (due > 0) {
    return n > 0
      ? t('shopping.listRestDueBought', { list: name, due, n })
      : t('shopping.listRestDue', { list: name, due })
  }
  return n > 0
    ? t('shopping.listRestBought', { list: name, n })
    : t('shopping.listRest', { list: name })
}

/** The line opens where there is something below it: a purchase, or the lock's sentence. */
function restExpandable(list: ShoppingMode): boolean {
  return isClosed(list) || bought.value[list].length > 0
}

/**
 * FR-25.11j: a bought row leaves the open list rather than vanishing —
 * M4's FR-25.2 recipe (`onRowLeave` there), reused by name via the shared
 * `collapseRow` (kernel `lib/`): height to zero, then gone. Checked live,
 * since the setting can change while the screen is open.
 */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/**
 * The rows mid-purchase, by key — the animated case. Every group is its own
 * `TransitionGroup`, so a row leaving *for any other reason* — retagged into
 * a different heading, or into the *Fällig* block — fires the exact same
 * `@leave` this does, and animating that reads as a duplicate row hanging in
 * the old heading for the length of the collapse. M4's `isReshaped` guards
 * the identical case for its own `TransitionGroup`.
 */
const buying = new Set<string>()

function onRowLeave(el: Element, done: () => void) {
  const key = (el as HTMLElement).dataset.rowKey
  if (key === undefined || !buying.has(key)) {
    done()
    return
  }
  buying.delete(key)
  collapseRow(el as HTMLElement, done, reducedMotion.matches)
}

/**
 * FR-25.11j: a purchase's own undo, live for as long as the toast — M4's
 * shape (`presentToast` with a button, anchored clear of the FAB) rather
 * than the dashboard card's inline panel (`ShoppingDashboardCard.vue`),
 * which exists only because several cards share that page and a toast
 * could not say which one it was for. M6 has one list; the toast is it.
 */
async function buyLine(line: ShoppingLine) {
  buying.add(line.key)
  line.buy()
  await presentToast({
    message: t('shopping.boughtUndoable', { name: line.name }),
    positionAnchor: FAB_ANCHOR.m6,
    cssClass: 'pack-toast',
    buttons: [{ text: t('packing.undo'), handler: () => line.unbuy() }],
  })
}

/**
 * FR-30.9: several own entries — tagged or not, on either list — retagged in
 * one act. Entered by a long press on an own row or by the header's icon; a
 * packing-projected line — `!line.edit` — never carries a tag and is never
 * selectable.
 */
const selection = useRowSelection()
const { selecting, selected } = selection

/** The lines a selection can act on: every open own entry, across both lists and every group. */
const ownOpenLines = computed(() => SHOPPING_MODES.flatMap((list) => own.open(props.tripId, list)))

const endSelecting = selection.end

/** „Alle N" takes every own line — the same act undoes it (FR-30.9, M9's `toggleAll`). */
function toggleAllSelected() {
  selection.toggleAll(ownOpenLines.value.map((line) => line.key))
}

setHeaderSelection(() =>
  selecting.value
    ? {
        count: selected.value.size,
        total: ownOpenLines.value.length,
        testid: 'm6',
        onExit: endSelecting,
        onAll: toggleAllSelected,
      }
    : null,
)

setHeaderActions(() => {
  const select: HeaderAction = {
    id: 'm6-select',
    icon: SELECTION_ICON,
    label: t('shopping.select'),
    active: selecting.value,
    onClick: () => (selecting.value ? endSelecting() : selection.start()),
  }
  return ownOpenLines.value.length > 0 || selecting.value ? [select] : []
})

const bulkSheetOpen = ref(false)

/** The last batch's undo, live for as long as its snackbar (FR-30.9, M9's `bulkUndo`). One batch at a time. */
let bulkUndo: (() => void) | null = null

function undoBulkTag() {
  const undo = bulkUndo
  bulkUndo = null
  undo?.()
}

/** One tag for the batch, across both lists: one write per list, one undo for both. */
async function applyBulkTag(tag: string | null) {
  const results = SHOPPING_MODES.map((list) =>
    own.bulkSetTag(props.tripId, list, selected.value, tag),
  )
  const touched = results.reduce((n, result) => n + result.touched, 0)
  bulkSheetOpen.value = false
  endSelecting()
  if (touched === 0) {
    await presentToast({
      message: t('shopping.bulkNothingToDo'),
      positionAnchor: FAB_ANCHOR.m6,
      cssClass: 'pack-toast',
    })
    return
  }
  bulkUndo = () => results.forEach((result) => result.undo())
  await presentToast({
    message: t(tag !== null ? 'shopping.bulkTagged' : 'shopping.bulkUntagged', {
      n: touched,
      tag: tag ?? '',
    }),
    positionAnchor: FAB_ANCHOR.m6,
    cssClass: 'pack-toast',
    buttons: [{ text: t('packing.undo'), handler: () => undoBulkTag() }],
  })
}

const draft = ref('')

const content = ref<InstanceType<typeof IonContent> | null>(null)
const composer = ref<{ focus: () => Promise<void> } | null>(null)

/**
 * FR-30.9's single-row retag: a grip lifts one own entry and drops it onto
 * another own group of **its own list** — a tag heading, or the untagged
 * one. The gesture is `useDragToGroup` (FR-7.8's own); a drop target is the
 * list and the section's key, since the same tag can head a group on both.
 *
 * The write goes through `bulkSetTag`, not `line.edit` — a drop is exactly a
 * batch of one, and `bulkSetTag`'s undo diffs against the entry as the write
 * actually left it rather than the pre-write snapshot (see its own doc
 * comment).
 */
const DROP_SEPARATOR = '|'

function dropKeyOf(list: ShoppingMode) {
  return (section: ShoppingSection) => `${list}${DROP_SEPARATOR}${section.key}`
}

function placeOf(place: DropPlace): { list: ShoppingMode; section: ShoppingSection } | null {
  const [list, key] = place.target.split(DROP_SEPARATOR) as [ShoppingMode, string]
  const section = board.value.lists[list]?.sections.find((s) => s.key === key)
  return section ? { list, section } : null
}

const dragHost = computed(() => content.value?.$el ?? null)

const drag = useDragToGroup<ShoppingLine>({
  accepts: (line, place) => {
    const at = placeOf(place)
    return (
      at !== null && at.list === board.value.listOf(line.key) && dropTag(at.section) !== undefined
    )
  },
  onDrop: (line, place) => {
    const at = placeOf(place)
    const toTag = at ? dropTag(at.section) : undefined
    if (!at || toTag === undefined) return
    const { touched, undo } = own.bulkSetTag(props.tripId, at.list, new Set([line.key]), toTag)
    if (touched === 0) return
    void presentToast({
      message: t('shopping.retagged', {
        name: line.name,
        group: toTag ?? t('shopping.ownEntries'),
      }),
      positionAnchor: FAB_ANCHOR.m6,
      cssClass: 'pack-toast',
      buttons: [{ text: t('packing.undo'), handler: () => undo() }],
    })
  },
})
watch(dragHost, (el) => drag.bindHost(el), { immediate: true })

/** The grip lifts at once — it exists only to be dragged (FR-7.8's own rule). */
function onLift(line: ShoppingLine, event: PointerEvent) {
  if (!line.edit || selecting.value) return
  const row = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-row-key]')
  if (row) drag.down(event, line, row, true)
}

/**
 * FR-30.6: the ＋ takes the reader to the field, wherever the list was
 * scrolled to — M4's gesture for adding, on a screen whose field is always
 * there. No animation: the next thing is typing, and a scroll still in
 * flight would be what the keyboard opens over.
 */
async function goToField() {
  await (content.value?.$el as HTMLIonContentElement | undefined)?.scrollToTop(0)
  await composer.value?.focus()
}

/**
 * The list the next entry goes on — M25's phase chips.
 * *Vor der Reise* until the trip is under way or its packing finished;
 * then the row goes and everything written is for the destination.
 */
const chosenList = ref<ShoppingMode>(ITEM_MODE_BUY_BEFORE)
const composeList = computed<ShoppingMode>(() =>
  beforeOpen.value ? chosenList.value : ITEM_MODE_BUY_LOCAL,
)

/*
 * FR-30.9: the tag the next entry is filed under. It stays after an add — the
 * things for one shop are typed one after another — and only the reader
 * clears it, by tapping the chip again.
 */
const draftTag = ref<string | null>(null)

/**
 * The tags on offer: those still in use on this trip, plus those made in this
 * visit — a tag nobody carries yet must stay a chip, or unselecting it would
 * make it disappear.
 */
const tagChips = computed(() => {
  const names = new Set(shoppingStore.tagCounts(props.tripId).map((entry) => entry.tag))
  for (const tag of [...madeTags.value, ...(draftTag.value ? [draftTag.value] : [])]) names.add(tag)
  return [...names].sort((a, b) => a.localeCompare(b))
})

function toggleDraftTag(tag: string) {
  draftTag.value = draftTag.value === tag ? null : tag
  if (draftTag.value !== null && !madeTags.value.includes(draftTag.value)) {
    madeTags.value.push(draftTag.value)
  }
}

/** The day chips' phase: *Vor Abreise* is offered only for what is bought before it. */
function phaseOf(list: ShoppingMode) {
  return list === ITEM_MODE_BUY_BEFORE ? TASK_PHASE_BEFORE : TASK_PHASE_DURING
}

/**
 * FR-30.10: the day the next entry is due — M25's chips.
 * Unlike the tag it does not stay after an add: two things due the same day
 * is a coincidence, not a series.
 */
const draftDue = ref<string | null>(null)
const tripStart = computed(() => trip.value?.start_date?.slice(0, 10) ?? null)
/** The day row waits for something to date, so the composer stays two lines at rest. */
const showDays = computed(() => draft.value.trim() !== '' || draftDue.value !== null)

/** FR-30.1: an entry of the list's own, on the list the composer names. */
function addEntry() {
  if (draft.value.trim() === '') return
  actions.addEntry(props.tripId, composeList.value, draft.value, draftTag.value, draftDue.value)
  draft.value = ''
  draftDue.value = null
}

/**
 * The entry sheet (FR-30.9): the name and the tag, like the packing list's
 * creation sheet, and the due day (FR-30.10). One mask for two acts — adding
 * an entry (opened from the composer's ＋ Tag, carrying what was typed there)
 * and editing one that exists (a tap on its name) — so `line` is what tells
 * them apart. An existing entry is removed here too, as a task is from its
 * sheet: the row carries no ✕ of its own.
 */
const entrySheet = ref<{
  line: ShoppingLine | null
  list: ShoppingMode
  name: string
  tag: string | null
  /** `YYYY-MM-DD`, or null for none. */
  due: string | null
} | null>(null)

/** Tags made in this visit, kept as chips even while no entry carries them yet. */
const madeTags = ref<string[]>([])

function openAddSheet() {
  entrySheet.value = {
    line: null,
    list: composeList.value,
    name: draft.value,
    tag: draftTag.value,
    due: draftDue.value,
  }
}

/** An existing entry, from a tap on its name; a source's line has nothing to edit. */
function openEditSheet(line: ShoppingLine) {
  if (!line.edit) return
  entrySheet.value = {
    line,
    list: board.value.listOf(line.key) ?? composeList.value,
    name: line.name,
    tag: line.tag ?? null,
    due: line.dueDate ?? null,
  }
}

function chooseSheetTag(tag: string | null) {
  if (entrySheet.value) entrySheet.value.tag = tag
  if (tag !== null && !madeTags.value.includes(tag)) madeTags.value.push(tag)
}

/** FR-30.10: the day chips' answer, null for none. */
function chooseSheetDue(day: string | null) {
  if (entrySheet.value) entrySheet.value.due = day
}

function confirmEntrySheet() {
  const sheet = entrySheet.value
  if (!sheet || sheet.name.trim() === '') return
  if (sheet.line?.edit) {
    sheet.line.edit({ name: sheet.name, tag: sheet.tag, dueDate: sheet.due })
  } else {
    actions.addEntry(props.tripId, sheet.list, sheet.name, sheet.tag, sheet.due)
    draft.value = ''
    draftDue.value = null
    draftTag.value = sheet.tag
  }
  entrySheet.value = null
}

function removeFromSheet() {
  entrySheet.value?.line?.remove?.()
  entrySheet.value = null
}

// ADR-050: the frame renders this page head, above the outlet.
setHeaderTitle(
  () => t('shopping.title'),
  () => trip.value?.name,
)
</script>

<template>
  <IonPage>
    <IonContent
      ref="content"
      class="shop-content"
      data-testid="m6-page"
      @pointermove="drag.move"
      @pointerup="drag.up"
      @pointercancel="drag.cancel"
    >
      <!-- M25's composer. G-20: in place while a
           selection is on, at rest — typing a new entry mid-batch is a
           different act, and a chip here only files the next entry. -->
      <div class="composer-slot" :class="{ resting: selecting }" :inert="selecting || undefined">
        <ListComposer
          ref="composer"
          v-model="draft"
          :placeholder="t('shopping.addPlaceholder')"
          :label="t('shopping.addPlaceholder')"
          :add-label="t('shopping.addLabel')"
          testid="m6-composer"
          input-testid="m6-add-input"
          submit-testid="m6-add-submit"
          form-testid="m6-add"
          @submit="addEntry"
        >
          <!-- The list the next entry goes on, while *before* still takes one. -->
          <ChipRow
            v-if="beforeOpen"
            :label="t('shopping.listLabel')"
            data-testid="m6-composer-list"
          >
            <ChoiceChip
              :pressed="composeList === ITEM_MODE_BUY_BEFORE"
              data-testid="m6-list-before"
              @click="chosenList = ITEM_MODE_BUY_BEFORE"
            >
              {{ t('shopping.beforeDeparture') }}
            </ChoiceChip>
            <ChoiceChip
              :pressed="composeList === ITEM_MODE_BUY_LOCAL"
              data-testid="m6-list-local"
              @click="chosenList = ITEM_MODE_BUY_LOCAL"
            >
              {{ t('shopping.atDestination') }}
            </ChoiceChip>
          </ChipRow>

          <!-- FR-30.9: the tag the next entry is filed under. -->
          <ChipRow :label="t('shopping.tags')" data-testid="m6-tag-chips">
            <ChoiceChip
              v-for="tag in tagChips"
              :key="tag"
              :pressed="draftTag === tag"
              data-testid="m6-tag-chip"
              @click="toggleDraftTag(tag)"
            >
              {{ tag }}
            </ChoiceChip>
            <ChoiceChip add data-testid="m6-tag-new" @click="openAddSheet">
              {{ t('shopping.tagAdd') }}
            </ChoiceChip>
          </ChipRow>

          <!-- FR-30.10: the day, once there is something to date. -->
          <DueChips
            v-if="showDays"
            :value="draftDue"
            :today="today"
            :phase="phaseOf(composeList)"
            :trip-start="tripStart"
            testid="m6-composer-due"
            @update="draftDue = $event"
          />
        </ListComposer>
      </div>

      <EmptyState
        v-if="!rowsLoaded && nothingAtAll"
        :title="t('shopping.listUnknown')"
        testid="m6-list-loading"
      />

      <!-- Empty state (G-7): nothing open and nothing bought, on either list. -->
      <EmptyState
        v-else-if="nothingAtAll"
        :icon="bagHandleOutline"
        :title="t('shopping.emptyAll')"
        :hint="t('shopping.emptyHint')"
        testid="m6-empty"
      />

      <template v-else>
        <!-- What is due now, across both lists and every tag (M25's block). -->
        <DueBlock
          v-if="board.due.length > 0"
          :title="t('shopping.dueGroup')"
          :count="board.due.length"
          testid="m6-due"
        >
          <ShoppingRows
            :lines="board.due"
            :today="today"
            :selection="selection"
            :tag-of="tagOfDue"
            :leave="onRowLeave"
            @buy="buyLine"
            @open="openEditSheet"
            @lift="onLift"
          />
        </DueBlock>

        <template v-for="list in SHOPPING_MODES" :key="list">
          <ShoppingListSection
            v-if="inOrder(list)"
            :list="list"
            :shelf="board.lists[list]"
            :bought="bought[list]"
            :today="today"
            :name-of="nameOf"
            :drop-key="dropKeyOf(list)"
            :selection="selection"
            :leave="onRowLeave"
            @buy="buyLine"
            @unbuy="(line) => line.unbuy()"
            @open="openEditSheet"
            @lift="onLift"
          />
        </template>

        <!-- M25 alike: a list with nothing open — or a
             finished packing's *before*, FR-7.12 — is one line at the end. -->
        <section
          v-for="list in restLists"
          :key="list"
          class="list-rest"
          :data-testid="list === ITEM_MODE_BUY_BEFORE ? 'm6-before' : 'm6-local'"
        >
          <RestLine
            :label="restLabel(list)"
            :expandable="restExpandable(list)"
            :open="restOpen[list]"
            :testid="list === ITEM_MODE_BUY_BEFORE ? 'm6-before-fold' : 'm6-local-fold'"
            @toggle="restOpen[list] = !restOpen[list]"
          >
            <InlineHint v-if="isClosed(list)" class="hint-wide" data-testid="m6-before-locked">{{
              t('shopping.beforeLocked')
            }}</InlineHint>
            <ShoppingListSection
              headless
              :readonly="isClosed(list)"
              :testid="list === ITEM_MODE_BUY_BEFORE ? 'm6-before-history' : 'm6-local-history'"
              :list="list"
              :shelf="board.lists[list]"
              :bought="bought[list]"
              :today="today"
              :name-of="nameOf"
              :drop-key="dropKeyOf(list)"
              @unbuy="(line) => line.unbuy()"
              @open="openEditSheet"
            />
          </RestLine>
        </section>
      </template>

      <!-- FR-30.9: the packing-projected lines the selection just skipped —
           named once, below the list, rather than repeated per dashed row. -->
      <p v-if="selecting && hasSourced" class="select-hint" data-testid="m6-select-hint">
        {{ t('shopping.selectHint') }}
      </p>

      <!-- FR-30.9: the same refusal, named once for the grip too. -->
      <p
        v-if="!selecting && ownOpenLines.length > 0 && hasSourced"
        class="select-hint"
        data-testid="m6-drag-hint"
      >
        {{ t('shopping.dragHint') }}
      </p>

      <!-- FR-30.9: what the selection can be acted on with. -->
      <BulkBar v-if="selecting && selected.size > 0" data-testid="m6-bulkbar">
        <button type="button" data-testid="m6-bulk-tag" @click="bulkSheetOpen = true">
          <IonIcon :icon="pricetagsOutline" />
          {{ t('shopping.bulkTag') }}
        </button>
      </BulkBar>

      <!-- FR-30.9: the same search-or-create mask as a single entry's sheet,
           titled for the batch and applying the pick to all of it at once.
           Guarded by `bulkSheetOpen` itself — `is-open` alone only animates
           the modal, and a test's stub renders the slot regardless. -->
      <SheetModal :is-open="bulkSheetOpen" testid="m6-bulk-sheet" @dismiss="bulkSheetOpen = false">
        <section v-if="bulkSheetOpen" class="entry-sheet">
          <SheetHead
            :title="t('shopping.bulkTagTitle', { n: selected.size })"
            title-testid="m6-bulk-title"
            close-testid="m6-bulk-close"
            @close="bulkSheetOpen = false"
          />
          <ShoppingTagChooser
            :tags="shoppingStore.tagCounts(tripId).map((entry) => entry.tag)"
            :assigned="null"
            :summary="false"
            @choose="applyBulkTag"
          />
        </section>
      </SheetModal>

      <!-- FR-30.9: name, day and tag — the one entry sheet M25's composer opens too. -->
      <EntrySheet
        :open="entrySheet !== null"
        :title="entrySheet?.line ? t('shopping.entrySheetEdit') : t('shopping.entrySheetNew')"
        :name="entrySheet?.name ?? ''"
        :name-label="t('shopping.entryName')"
        :due-label="t('shopping.dueField')"
        :confirm-label="entrySheet?.line ? t('common.save') : t('common.add')"
        :removable="!!entrySheet?.line?.remove"
        :dated="entrySheet?.line?.boughtAt === undefined"
        testid="m6-entry-sheet"
        title-testid="m6-entry-title"
        close-testid="m6-entry-close"
        name-testid="m6-entry-name"
        confirm-testid="m6-entry-confirm"
        remove-testid="m6-entry-remove"
        @close="entrySheet = null"
        @update:name="(name) => entrySheet && (entrySheet.name = name)"
        @confirm="confirmEntrySheet"
        @remove="removeFromSheet"
      >
        <template #due>
          <DueChips
            v-if="entrySheet"
            :value="entrySheet.due"
            :today="today"
            :phase="phaseOf(entrySheet.list)"
            :trip-start="tripStart"
            testid="m6-entry-due"
            @update="chooseSheetDue"
          />
        </template>
        <template #tag>
          <ShoppingTagChooser
            v-if="entrySheet"
            :tags="shoppingStore.tagCounts(tripId).map((entry) => entry.tag)"
            :assigned="entrySheet.tag"
            @choose="chooseSheetTag"
          />
        </template>
      </EntrySheet>
      <!-- FR-30.6: M4's ＋, bottom right. The field it leads to stays at the
           top of the list, so the screen still has one way to add. Hidden
           while selecting (FR-30.9, M9's own rule). -->
      <IonFab v-if="!selecting" :id="FAB_ANCHOR.m6" slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton data-testid="m6-fab" :aria-label="t('common.add')" @click="goToField">
          <IonIcon :icon="addOutline" aria-hidden="true" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* FR-25.11h's rule, for M6's FAB (FR-30.6): the list scrolls clear of its
   footprint, so the last row is never under the ＋. M4's measure. */
.shop-content {
  --padding-bottom: 96px;
}

/* G-20: at rest while a selection is on — in place, so nothing moves. */
.composer-slot.resting {
  opacity: 0.45;
}

.hint-wide {
  margin: 4px 18px 8px;
}

.select-hint {
  padding: 4px 16px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.entry-sheet {
  padding: 4px 18px 22px;
}
</style>
