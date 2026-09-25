<script setup lang="ts">
/**
 * M6 — the shopping list (FR-3.2, FR-30).
 *
 * Two lists, *Vor der Abreise* and *Vor Ort*, each read from every source
 * the composition root provides (`lib/shoppingSources.ts`) plus the list's
 * own entries. What a line *is* — a packing row bought rather than packed, or
 * „Milch" typed here — is its source's business; this screen renders lines,
 * checks them off and puts them back, and never learns which. That is the
 * module boundary of FR-30.3 (ADR-066): nothing here imports packing code,
 * and a packing line's check-off writes FR-3.3/FR-25.11j through the write
 * its source bound into it.
 *
 * The field at the top adds an entry of the list's own, to the open tab: it
 * is on the shopping list alone and counts towards no packing figure. Adding
 * a packing row in a buy mode is the packing list's job (M4), where the item
 * and its mode are chosen.
 */
import {
  IonPage,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonList,
  IonItem,
  IonCheckbox,
  IonInput,
  IonButton,
  IonIcon,
  IonFab,
  IonFabButton,
} from '@ionic/vue'
import {
  addOutline,
  bagHandleOutline,
  checkboxOutline,
  closeOutline,
  pricetagsOutline,
} from 'ionicons/icons'
import { computed, inject, onMounted, ref, watch } from 'vue'

import BulkBar from '@/components/global/BulkBar.vue'
import DragGrip from '@/components/global/DragGrip.vue'
import EmptyState from '@/components/global/EmptyState.vue'
import ListGroup from '@/components/global/ListGroup.vue'
import RevealBar from '@/components/global/RevealBar.vue'
import SelectBox from '@/components/global/SelectBox.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { useDragToGroup, type DropPlace } from '@/composables/useDragToGroup'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderSelection } from '@/composables/useHeaderSelection'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useRowSelection } from '@/composables/useRowSelection'
import { useTripScreen } from '@/composables/useTripScreen'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { collapseRow } from '@/lib/rowCollapse'
import { presentToast } from '@/lib/toast'
import { boughtStampText } from '@/lib/rowFacts'
import { SHOPPING_SOURCES, type ShoppingLine } from '@/lib/shoppingSources'
import type { ShoppingMode } from '@/types/domain'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL, TRIP_STATUS_PLANNING } from '@/types/domain'
import { isPackingClosed } from '@/lib/tripPhase'
import { createShoppingActions, ownEntriesSource } from './actions'
import { buildSections, dropTag, listInFocus, type ShoppingSection } from './list'
import ShoppingTagChooser from './ShoppingTagChooser.vue'
import { useShoppingStore } from './store'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const shoppingStore = useShoppingStore()
const actions = createShoppingActions(orchestrator.moduleHost)
const own = ownEntriesSource(shoppingStore, actions)
// Absent in a spec that provides none: the list still works on its own.
const sources = inject(SHOPPING_SOURCES, [])

/**
 * FR-25.11j's reveal, shaped like M4's *Erledigte* bar (FR-25.2): off by
 * default, one tap, and the count in the label so the bar states what it is
 * hiding. Deliberately **not** carried across a session the way FR-25.18
 * carries M4's switch: that rule is about not re-picking a filter of four
 * facet values, and it does not reach a single tap whose off-state is the
 * safe one — the more so as the tab itself is not remembered either, so a
 * restored reveal would open on a list the reader did not choose.
 */
const showBought = ref(false)

// ADR-033: whether this trip's rows are here — the entries travel the same
// partition as the packing rows. „Nothing to buy" is a sentence somebody
// leaves the house on, and a partition still in flight is not it.
const { trip, loaded: rowsLoaded, ensure } = useTripScreen(props.tripId, orchestrator)

/**
 * The tab the reader picked; none yet means the trip decides (FR-30.8).
 *
 * Until the trip itself is on the device there is nothing to decide with, and
 * *Vor der Abreise* is the answer that cannot be wrong for a trip nobody has
 * left on yet — a rule read off an absent trip would open a planned trip at
 * the destination and then move the tab under the reader.
 */
const chosen = ref<ShoppingMode | null>(null)
const tab = computed<ShoppingMode>(() => {
  if (chosen.value !== null) return chosen.value
  if (!trip.value) return ITEM_MODE_BUY_BEFORE
  return listInFocus({
    planned: trip.value.status === TRIP_STATUS_PLANNING,
    packingClosed: isPackingClosed(trip.value),
  })
})

// FR-30.4: a purchase is named from the trip's participants, the way every
// other stamp on the trip is — empty in Local Mode, where nobody is named.
const { nameOf, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)
onMounted(async () => {
  await ensure()
  await loadIdentity()
})

/** „gekauft von Andy · heute 14:32" — who bought the line, and when. */
function boughtStamp(line: ShoppingLine): string | null {
  return boughtStampText(line.boughtAt, line.boughtBy, nameOf)
}

function openLines(list: ShoppingMode) {
  return {
    own: own.open(props.tripId, list),
    sourced: sources.flatMap((source) => source.open(props.tripId, list)),
  }
}

const open = computed(() => openLines(tab.value))
const sections = computed(() => buildSections(open.value.own, open.value.sourced))

/**
 * FR-25.11j: a bought row leaves the open list rather than vanishing —
 * M4's FR-25.2 recipe (`onRowLeave` there), reused by name via the shared
 * `collapseRow` (kernel `lib/`): height to zero, then gone. Checked live,
 * since the setting can change while the screen is open.
 */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/**
 * The rows mid-purchase, by key — the animated case. Every section is its
 * own `TransitionGroup` (a tag heading's rows are not siblings of another
 * heading's), so a row leaving *for any other reason* — retagged into a
 * different heading, or the tab switched under it — fires the exact same
 * `@leave` this does, and animating that read as a duplicate row hanging in
 * the old heading for the length of the collapse (a rendered check, not a
 * guess). M4's `isReshaped` guards the identical case for its own
 * `TransitionGroup`; this is that guard's shopping-list shape.
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
 * FR-30.9: several own entries — tagged or not — retagged in one act. Inline
 * on this list rather than a separate selection screen like M9's (FR-24.9):
 * unlike M9's rows, a shopping row is not a navigation link, so a long press
 * fights nothing here. Entered by a long press on an own row or by the
 * header's icon (`select`, mirroring M9's `m9-select`); a packing-projected
 * line — `!line.edit` — never carries a tag and is never selectable.
 */
const selection = useRowSelection()
const { selecting, selected } = selection

/** The lines a selection can act on: the open tab's own entries, spanning every tag group. */
const ownOpenLines = computed(() => open.value.own)

const endSelecting = selection.end

/** „Alle N" takes every own line on the open tab — the same act undoes it (FR-30.9, M9's `toggleAll`). */
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

/** Not selecting → a tap on an own entry's name opens its sheet; selecting → it toggles the row. */
function onRowClick(line: ShoppingLine) {
  if (selection.click(line.key, !!line.edit)) return
  openEditSheet(line)
}

setHeaderActions(() => {
  const select: HeaderAction = {
    id: 'm6-select',
    icon: checkboxOutline,
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

async function applyBulkTag(tag: string | null) {
  const { touched, undo } = own.bulkSetTag(props.tripId, tab.value, selected.value, tag)
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
  bulkUndo = undo
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

/** Flattened: the reveal is a short list of what left, not a second screen. */
const boughtLines = computed(() => [
  ...own.bought(props.tripId, tab.value),
  ...sources.flatMap((source) => source.bought(props.tripId, tab.value)),
])

function tabCount(list: ShoppingMode): number {
  const lines = openLines(list)
  return lines.own.length + lines.sourced.length
}

/*
 * ADR-033 for the labels above the note: until the trip partition is here,
 * „Vor der Abreise (0)" states the same absence the body declines to state,
 * and in the form a reader trusts more. The count returns the moment it is a
 * measurement — a genuinely empty tab is worth naming.
 */
const beforeTabLabel = computed(() =>
  rowsLoaded.value
    ? t('shopping.beforeDepartureCount', { n: tabCount(ITEM_MODE_BUY_BEFORE) })
    : t('shopping.beforeDeparture'),
)
const localTabLabel = computed(() =>
  rowsLoaded.value
    ? t('shopping.atDestinationCount', { n: tabCount(ITEM_MODE_BUY_LOCAL) })
    : t('shopping.atDestination'),
)

/** The recipients, named in roster order (FR-25.6). */
function recipientNames(line: ShoppingLine): string {
  return line.recipients.map((recipient) => recipient.name).join(', ')
}

const draft = ref('')

const content = ref<InstanceType<typeof IonContent> | null>(null)
const field = ref<InstanceType<typeof IonInput> | null>(null)

/**
 * FR-30.9's single-row retag: a grip lifts one own entry and drops it onto
 * another own section — a tag heading, or the untagged one — filing it there
 * the way the bulk sheet would for a batch of one. The gesture itself is
 * `useDragToGroup` (FR-7.8's own, `TripTasksPage.vue`), which knows nothing
 * about tags; a section's own `key` (already unique — `list.ts`) is what
 * this screen hands it as the drop target's name, so no second key scheme is
 * invented. Off while selecting: the grip and the selection checkbox share
 * the row's leading slot, and a drag mid-selection would fight the
 * tap-to-toggle gesture on the same rows.
 *
 * The write goes through `bulkSetTag`, not `line.edit` — a drop is exactly a
 * batch of one, and `bulkSetTag`'s undo already diffs against the entry as
 * the write actually left it rather than the pre-write snapshot (see its own
 * doc comment). Two `line.edit` calls in a row — apply, then this gesture's
 * own undo — would diff the second against the same stale snapshot the first
 * one used, see the value it started at, and silently write nothing: the
 * identical bug `bulkSetTag`'s own undo was written to avoid.
 */
const dragHost = computed(() => content.value?.$el ?? null)

function sectionAt(place: DropPlace): ShoppingSection | null {
  return sections.value.find((section) => section.key === place.target) ?? null
}

const drag = useDragToGroup<ShoppingLine>({
  accepts: (_line, place) => {
    const section = sectionAt(place)
    return section !== null && dropTag(section) !== undefined
  },
  onDrop: (line, place) => {
    const section = sectionAt(place)
    const toTag = section ? dropTag(section) : undefined
    if (toTag === undefined) return
    const { touched, undo } = own.bulkSetTag(props.tripId, tab.value, new Set([line.key]), toTag)
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
function onGripDown(line: ShoppingLine, event: PointerEvent) {
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
  await (field.value?.$el as HTMLIonInputElement | undefined)?.setFocus()
}

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

/** FR-30.1: an entry of the list's own, on the open tab. */
function addEntry() {
  if (draft.value.trim() === '') return
  actions.addEntry(props.tripId, tab.value, draft.value, draftTag.value)
  draft.value = ''
}

/**
 * The entry sheet (FR-30.9): the name and the tag, like the packing list's
 * creation sheet. One mask for two acts — adding an entry (opened from the
 * composer's ＋ Tag, carrying what was typed there) and editing one that
 * exists (a tap on its name) — so `line` is what tells them apart.
 */
const entrySheet = ref<{
  line: ShoppingLine | null
  name: string
  tag: string | null
} | null>(null)

/** Tags made in this visit, kept as chips even while no entry carries them yet. */
const madeTags = ref<string[]>([])

function openAddSheet() {
  entrySheet.value = { line: null, name: draft.value, tag: draftTag.value }
}

/** An existing entry, from a tap on its name; a source's line has nothing to edit. */
function openEditSheet(line: ShoppingLine) {
  if (!line.edit) return
  entrySheet.value = { line, name: line.name, tag: line.tag ?? null }
}

function chooseSheetTag(tag: string | null) {
  if (entrySheet.value) entrySheet.value.tag = tag
  if (tag !== null && !madeTags.value.includes(tag)) madeTags.value.push(tag)
}

function confirmEntrySheet() {
  const sheet = entrySheet.value
  if (!sheet || sheet.name.trim() === '') return
  if (sheet.line?.edit) {
    sheet.line.edit({ name: sheet.name, tag: sheet.tag })
  } else {
    actions.addEntry(props.tripId, tab.value, sheet.name, sheet.tag)
    draft.value = ''
    draftTag.value = sheet.tag
  }
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
      <!-- ADR-011: a view switcher is page content, not header chrome. -->
      <IonSegment :value="tab" @ionChange="(e: CustomEvent) => (chosen = e.detail.value)">
        <IonSegmentButton :value="ITEM_MODE_BUY_BEFORE" data-testid="m6-tab-before">
          <IonLabel>{{ beforeTabLabel }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton :value="ITEM_MODE_BUY_LOCAL" data-testid="m6-tab-local">
          <IonLabel>{{ localTabLabel }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <!-- G-20: the add row and its chips stay where they are while a
           selection is on — the selection's bar is the app bar's, so nothing
           under the finger moves — but they rest: typing a new entry
           mid-batch is a different act, and a chip here only files the
           next entry. -->
      <div
        class="composer"
        :class="{ resting: selecting }"
        :inert="selecting || undefined"
        data-testid="m6-composer"
      >
        <form class="add" data-testid="m6-add" @submit.prevent="addEntry">
          <IonInput
            ref="field"
            v-model="draft"
            class="add-input"
            :placeholder="t('shopping.addPlaceholder')"
            :aria-label="t('shopping.addPlaceholder')"
            enterkeyhint="done"
            data-testid="m6-add-input"
            @keyup.enter="addEntry"
          />
          <IonButton
            type="submit"
            fill="clear"
            :disabled="draft.trim() === ''"
            :aria-label="t('shopping.addLabel')"
            data-testid="m6-add-submit"
          >
            <IonIcon slot="icon-only" :icon="addOutline" aria-hidden="true" />
          </IonButton>
        </form>

        <!-- FR-30.9: the tag the next entry is filed under. -->
        <div class="chips" role="group" :aria-label="t('shopping.tags')" data-testid="m6-tag-chips">
          <button
            v-for="tag in tagChips"
            :key="tag"
            type="button"
            class="chip"
            :aria-pressed="draftTag === tag"
            data-testid="m6-tag-chip"
            @click="toggleDraftTag(tag)"
          >
            {{ tag }}
          </button>
          <button
            type="button"
            class="chip chip-add"
            data-testid="m6-tag-new"
            @click="openAddSheet"
          >
            {{ t('shopping.tagAdd') }}
          </button>
        </div>
      </div>

      <IonList v-if="sections.length > 0">
        <ListGroup
          v-for="section in sections"
          :key="section.key"
          :title="
            section.packing
              ? t('shopping.packingList')
              : section.own
                ? t('shopping.ownEntries')
                : (section.name ?? '')
          "
          :drop-target="section.key"
          :droppable="dropTag(section) !== undefined"
          :data-testid="`m6-group-${section.packing ? 'packing' : section.own ? 'own' : `tag-${section.name}`}`"
        >
          <!-- FR-25.11j: a bought row leaves rather than vanishes — M4's
               FR-25.2 `pack-out` recipe, kept to this list's own class names
               since a scoped style cannot reach across components anyway. -->
          <TransitionGroup tag="div" name="buy-out" class="row-group" @leave="onRowLeave">
            <IonItem
              v-for="line in section.lines"
              :key="line.key"
              :data-row-key="line.key"
              :data-selected="selecting && selected.has(line.key) ? 'true' : undefined"
              data-testid="m6-row"
            >
              <!-- FR-30.9: a selection checkbox at the leading edge, like M9's
                 `SelectBox` — a dashed, dimmed slot for a packing-projected line,
                 which never carries a tag and so is never selectable. -->
              <SelectBox
                v-if="selecting"
                slot="start"
                :on="selected.has(line.key)"
                :off="!line.edit"
                :data-testid="`m6-row-check-${line.name}`"
              />
              <!-- FR-30.9's single-row drag: a grip lifts one own entry onto
                 another own section — `useDragToGroup`'s own rule, it lifts
                 at once. Not selecting, own entries only — the same
                 eligibility the selection checkbox uses, since a
                 packing-projected line carries no tag to drag either way. -->
              <DragGrip
                v-else-if="line.edit"
                slot="start"
                :label="t('shopping.dragToRetag', { name: line.name })"
                :data-testid="`m6-row-grip-${line.name}`"
                @pointerdown.stop="(e: PointerEvent) => onGripDown(line, e)"
              />
              <!-- FR-30.9: a packing-projected line has nothing to drag either
                 (owner feedback 2026-09-23: an empty gap here read as broken,
                 not as absent) — a dashed placeholder, `SelectBox`'s `off`, the
                 language for the same refusal on the checkbox. -->
              <DragGrip v-else slot="start" off />
              <!-- FR-30.9: not selecting → a tap on an own entry's name files it
                 under a tag; a long press (or right-click) on one starts a
                 selection. Selecting → the same tap toggles the row instead. -->
              <IonLabel
                :class="{ tappable: !!line.edit, selectable: selecting && !!line.edit }"
                :role="line.edit ? 'button' : undefined"
                :tabindex="line.edit ? 0 : undefined"
                data-testid="m6-row-label"
                @click="onRowClick(line)"
                @keyup.enter="onRowClick(line)"
                @pointerdown="(e: PointerEvent) => line.edit && selection.press(line.key, e)"
                @pointermove="selection.move"
                @pointerup="selection.release"
                @pointercancel="selection.release"
                @contextmenu.prevent="line.edit && selection.contextMenu(line.key)"
              >
                <h3>{{ line.name }}</h3>
                <p v-if="line.quantity > 1">{{ line.quantity }}×</p>
                <!-- FR-25.6: for whom, derived from membership — never a control. -->
                <p v-if="line.recipients.length > 0" class="recipients" data-testid="m6-row-for">
                  <UserAvatar
                    v-for="recipient in line.recipients"
                    :key="recipient.id"
                    :name="recipient.name"
                    :seed="recipient.id"
                    :size="18"
                  />
                  <span>{{ t('shopping.forWhom', { names: recipientNames(line) }) }}</span>
                </p>
              </IonLabel>
              <template v-if="!selecting">
                <IonButton
                  v-if="line.remove"
                  slot="end"
                  fill="clear"
                  :aria-label="t('shopping.remove', { name: line.name })"
                  data-testid="m6-row-remove"
                  @click="line.remove()"
                >
                  <IonIcon slot="icon-only" :icon="closeOutline" aria-hidden="true" />
                </IonButton>
                <!-- FR-30.9: the check-off sits at the end, where the thumb rests. -->
                <IonCheckbox
                  slot="end"
                  :checked="false"
                  :aria-label="t('shopping.bought', { name: line.name })"
                  @ionChange="buyLine(line)"
                />
              </template>
            </IonItem>
          </TransitionGroup>
        </ListGroup>
      </IonList>

      <EmptyState
        v-else-if="!rowsLoaded"
        :title="t('shopping.listUnknown')"
        testid="m6-list-loading"
      />

      <!-- Empty state (G-7) -->
      <EmptyState
        v-else
        :icon="bagHandleOutline"
        :title="t(tab === ITEM_MODE_BUY_BEFORE ? 'shopping.emptyBefore' : 'shopping.emptyLocal')"
        :hint="t('shopping.emptyHint')"
        testid="m6-empty"
      />

      <!-- FR-30.9: the packing-projected lines the selection just skipped —
           named once, below the list, rather than repeated per dashed row. -->
      <p
        v-if="selecting && open.sourced.length > 0"
        class="select-hint"
        data-testid="m6-select-hint"
      >
        {{ t('shopping.selectHint') }}
      </p>

      <!-- FR-30.9: the same refusal, named once for the grip too — the
           dashed placeholder and the never-highlighted heading say it
           visually; this says it in words the same way `m6-select-hint`
           already does for the checkbox (owner feedback 2026-09-23). -->
      <p
        v-if="!selecting && open.own.length > 0 && open.sourced.length > 0"
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
           Guarded by `bulkSheetOpen` itself, like the entry sheet's own
           `v-if="entrySheet"` — `is-open` alone only animates the modal; a
           test's stub for it renders the slot regardless, and a second,
           always-mounted `ShoppingTagChooser` would shadow the real one. -->
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

      <!-- FR-25.11j: what was bought from this list. Same affordance as M4's
           FR-25.2 done bar — the count is in the label, and one tap reveals. -->
      <RevealBar
        v-if="boughtLines.length > 0"
        :open="showBought"
        :label="
          showBought
            ? t('shopping.hideBought', { n: boughtLines.length })
            : t('shopping.showBought', { n: boughtLines.length })
        "
        testid="m6-bought-bar"
        @toggle="showBought = !showBought"
      />

      <IonList v-if="showBought && boughtLines.length > 0" data-testid="m6-bought-list">
        <IonItem v-for="line in boughtLines" :key="line.key" data-testid="m6-bought-row">
          <IonLabel>
            <h3>{{ line.name }}</h3>
            <!-- FR-30.9: the reveal is flat, so the tag has to be said in the row. -->
            <p v-if="line.tag" class="tag-chip" data-testid="m6-bought-tag">{{ line.tag }}</p>
            <p v-if="line.boughtNote" data-testid="m6-bought-note">{{ line.boughtNote }}</p>
            <!-- FR-30.4: who bought it, and when. -->
            <p v-if="boughtStamp(line)" class="recipients" data-testid="m6-bought-stamp">
              <UserAvatar
                v-if="line.boughtBy && nameOf(line.boughtBy)"
                :name="nameOf(line.boughtBy)"
                :seed="line.boughtBy"
                :size="18"
              />
              <span>{{ boughtStamp(line) }}</span>
            </p>
          </IonLabel>
          <IonButton
            v-if="line.remove"
            slot="end"
            fill="clear"
            :aria-label="t('shopping.remove', { name: line.name })"
            data-testid="m6-bought-remove"
            @click="line.remove()"
          >
            <IonIcon slot="icon-only" :icon="closeOutline" aria-hidden="true" />
          </IonButton>
          <IonCheckbox
            slot="end"
            :checked="true"
            :aria-label="t('shopping.undoBought', { name: line.name })"
            @ionChange="line.unbuy()"
          />
        </IonItem>
      </IonList>

      <!-- FR-30.9: name and tag — the packing list's creation sheet, for an entry. -->
      <SheetModal
        :is-open="entrySheet !== null"
        testid="m6-entry-sheet"
        @dismiss="entrySheet = null"
      >
        <section v-if="entrySheet" class="entry-sheet">
          <SheetHead
            :title="entrySheet.line ? t('shopping.entrySheetEdit') : t('shopping.entrySheetNew')"
            title-testid="m6-entry-title"
            close-testid="m6-entry-close"
            @close="entrySheet = null"
          />
          <IonInput
            :value="entrySheet.name"
            :label="t('shopping.entryName')"
            label-placement="stacked"
            fill="outline"
            data-testid="m6-entry-name"
            @ionInput="
              (e: CustomEvent) => entrySheet && (entrySheet.name = (e.detail.value as string) ?? '')
            "
            @keyup.enter="confirmEntrySheet"
          />
          <ShoppingTagChooser
            :tags="shoppingStore.tagCounts(tripId).map((entry) => entry.tag)"
            :assigned="entrySheet.tag"
            @choose="chooseSheetTag"
          />
          <div class="entry-sheet-actions">
            <IonButton
              :disabled="entrySheet.name.trim() === ''"
              data-testid="m6-entry-confirm"
              @click="confirmEntrySheet"
            >
              {{ entrySheet.line ? t('common.save') : t('common.add') }}
            </IonButton>
          </div>
        </section>
      </SheetModal>
      <!-- FR-30.6: M4's ＋, bottom right. The field it leads to stays at the
           top of the list, so the screen still has one way to add. Hidden
           while selecting (FR-30.9, M9's own rule): the bulk bar sits where
           it would, and there is nothing to add to a batch mid-selection. -->
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

/* A `TransitionGroup` wrapper with no footprint of its own — it exists only
   so `buy-out`'s leave/move classes have a shared parent to animate within
   an `IonItemGroup`, not to add a layer to the layout. */
.row-group {
  display: contents;
}

/* --- FR-25.11j: the buy-out — M4's `pack-out` recipe (FR-25.2), by its own
   name here since a scoped style cannot reach across components. A bought
   row washes the done colour, collapses to nothing, then fades — the
   evidence a mistap happened, instead of the row being simply gone on the
   next tick. The height itself is driven from `onRowLeave`; `overflow:
   hidden` is what makes the collapse read as a collapse rather than a clip. */
.buy-out-leave-active {
  transition:
    height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.3s ease,
    background-color 0.3s ease;
  overflow: hidden;
  pointer-events: none;
}

.buy-out-leave-from {
  background: color-mix(in srgb, var(--jp-done) 22%, transparent);
}

.buy-out-leave-to {
  opacity: 0;
}

/* Rows below a leaving one slide up instead of jumping. */
.buy-out-move {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* FR-25.11j's feedback is the *fact* of the purchase, not the motion — with
   motion reduced the row still leaves and the toast still offers the undo;
   only the travel is dropped. `onRowLeave` matches this by finishing at
   once, so the two cannot disagree. */
@media (prefers-reduced-motion: reduce) {
  .buy-out-leave-active,
  .buy-out-move {
    transition: none;
  }

  .buy-out-leave-from {
    background: none;
  }
}

.recipients {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* G-20: at rest while a selection is on — in place, so nothing moves. */
.composer.resting {
  opacity: 0.45;
}

.add {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px 0;
}

.add-input {
  flex: 1;
  min-height: 40px;
}

/* The ＋ is a control in a row of 40, not a 48 that pushes the chips below it down. */
.add ion-button {
  margin: 0;
  height: 40px;
}

/* FR-30.9: the tag the next entry is filed under. */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 8px;
}

.chip {
  padding: 5px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.chip[aria-pressed='true'] {
  border-color: var(--jp-action);
  color: var(--jp-action);
}

.chip-add {
  background: none;
  color: var(--ct-subtext0);
}

.chip:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}

.tappable {
  cursor: pointer;
}

.selectable {
  user-select: none;
}

.select-hint {
  padding: 4px 16px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.tag-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
}

.entry-sheet {
  padding: 4px 18px 22px;
}

.entry-sheet-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
