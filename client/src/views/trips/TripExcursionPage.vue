<script setup lang="ts">
/**
 * One excursion's list (FR-31.6) — the packing list, smaller. It is built
 * from M4's own parts so it reads and works like it: the collapsible group
 * heads, `PackingRow` with its stepper and glyphs, FR-25.1's `ClusterHead`
 * for a thing per person, and the orange ＋ that opens M4's quick-add with
 * its inventory search, its groups and its *für wen* strip — over the people
 * going (FR-31.5). What a line needs done stands under its name
 * (`ExcursionFacts`); what the excursion needs done — edit it, save it as a
 * Gruppe, delete it — is in the bar's ⋮.
 */
import {
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonList,
  IonPage,
  actionSheetController,
} from '@ionic/vue'
import {
  addOutline,
  chevronDownOutline,
  createOutline,
  layersOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import ProgressFigure from '@/components/global/ProgressFigure.vue'
import QuickAddItem, { type BrowseAddition } from '@/components/global/QuickAddItem.vue'
import ClusterHead from '@/components/trips/ClusterHead.vue'
import TravelerProgressStrip from '@/components/trips/TravelerProgressStrip.vue'
import ExcursionFacts from '@/components/trips/ExcursionFacts.vue'
import ExcursionItemSheet from '@/components/trips/ExcursionItemSheet.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import PackingRow, { type PackingRowNotes } from '@/components/trips/PackingRow.vue'
import ExcursionSheet, { type ExcursionSheetResult } from '@/components/trips/ExcursionSheet.vue'
import { setHeaderActions } from '@/composables/useHeaderActions'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useLongPress } from '@/composables/useLongPress'
import { usePackAnnouncer } from '@/composables/usePackAnnouncer'
import type { RowUndoRecord } from '@/composables/useRowUndo'
import { collapseRow } from '@/lib/rowCollapse'
import RevealBar from '@/components/global/RevealBar.vue'
import { useTripScreen } from '@/composables/useTripScreen'
import {
  canAdoptIntoInventory,
  canJoinPackingList,
  draftLinesFor,
  excursionLineAsRow,
  isLeftBehind,
  isOpenPurchase,
  namesItsParticipants,
  participantsOf,
  spanOf,
  suitcaseOf,
  sumUnits,
  type LineFor,
} from '@/domain/excursions'
import { buildPackingView, noFacets } from '@/domain/packingView'
import { stateFor } from '@/domain/packState'
import { packedPercent } from '@/domain/packState'
import { progressByTraveler, showsTravelerProgress } from '@/domain/travelerProgress'
import { t } from '@/i18n'
import { chooseAction, confirmDestructive, promptText } from '@/lib/confirm'
import { excursionDays } from '@/lib/excursionText'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { groupAdditionMessage } from '@/lib/groupAdditionMessage'
import { presentToast } from '@/lib/toast'
import { beforeIsOver, standingOf } from '@/lib/tripPhase'
import { tripExcursionsPath } from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ExcursionItem, TripItem } from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK, STATE_SKIPPED } from '@/types/domain'

const props = defineProps<{ tripId: string; excursionId: string }>()

/** M4's header ring (PackingListPage), so the two figures are one size. */
const RING_SIZE_HEADER = 42

const orchestrator = useOrchestrator()
const tripStore = useTripStore()
const masterStore = useMasterStore()
const router = useRouter()

const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)

const excursion = computed(
  () => tripStore.getExcursions(props.tripId).find((e) => e.id === props.excursionId) ?? null,
)
const travelers = computed(() => tripStore.getTravelers(props.tripId))
const participantRows = computed(() => tripStore.getExcursionTravelers(props.tripId))
const participants = computed(() =>
  participantsOf(props.excursionId, participantRows.value, travelers.value),
)
const lines = computed(() => tripStore.getExcursionItems(props.tripId, props.excursionId))
/**
 * M4's person filter, from the same strip: one person's lines, or the shared
 * ones — a second tap on the same card lets go.
 */
const person = ref<string | null>(null)
function selectPerson(value: string) {
  person.value = person.value === value ? null : value
}
/** The lines by id, to get from M4's row back to the line it reads. */
const lineById = computed(() => new Map(lines.value.map((l) => [l.id, l])))
function lineOf(item: TripItem): ExcursionItem {
  return lineById.value.get(item.id)!
}

/** FR-25.2 on the excursion: packed lines leave the list until revealed. */
const showDone = ref(false)

/**
 * M4's own view model over the lines read as M4's rows (FR-31.6): the same
 * grouping, clusters, counts and FR-25.2 departure, so the list behaves as the
 * packing list does because it is built by the same function.
 */
const view = computed(() =>
  buildPackingView({
    items: lines.value.map(excursionLineAsRow),
    travelers: travelers.value,
    containers: [],
    participants: [],
    groupBy: GROUP_BY_CATEGORY,
    showDone: showDone.value,
    facets: { ...noFacets(), person: person.value === null ? [] : [person.value] },
    search: '',
    currentUserId: null,
    showOthers: true,
    showLate: true,
    collapsedGroups: [...shutGroups.value],
    expandedClusters: [...openClusters.value],
    itemsWithOpenPrep: [],
  }),
)
const units = computed(() => sumUnits(lines.value))
const toBuy = computed(() => lines.value.filter(isOpenPurchase).length)
const tripItems = computed(() => tripStore.getItems(props.tripId))

const suitcaseOpen = computed(
  () => trip.value !== undefined && !beforeIsOver(standingOf(trip.value), orchestrator.today()),
)

// An excursion deleted — here or on another device — has nothing left to show.
watch([loaded, excursion], ([ready, current]) => {
  if (ready && !current) void router.replace(tripExcursionsPath(props.tripId))
})

const metaLine = computed(() => {
  const ex = excursion.value
  if (!ex) return null
  const days = excursionDays(spanOf(ex)) ?? t('excursions.undated')
  const who = namesItsParticipants(ex.id, participantRows.value)
    ? participants.value.map((p) => p.name).join(', ')
    : t('excursions.participantsAll')
  return `${days} · ${who}`
})

/** A line says nothing in M4's own note slots — its facts are its own. */
const NO_NOTES: PackingRowNotes = {
  lock: null,
  ownClaim: null,
  skipped: null,
  packed: null,
  responsible: null,
}

// --- the fold of a group (view state, as on M4) ---

const shutGroups = ref(new Set<string>())
/** M4's grouping on this list: by category, the only axis an excursion has. */
const GROUP_BY_CATEGORY = 'category'
function toggleGroup(key: string) {
  const next = new Set(shutGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  shutGroups.value = next
}

function masterOf(sourceItemId: string | null) {
  return sourceItemId ? (masterStore.getItem(sourceItemId) ?? null) : null
}

// --- the fold of a cluster (view state, not persisted — FR-25.23) ---

const openClusters = ref(new Set<string>())
function toggleCluster(key: string) {
  const next = new Set(openClusters.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openClusters.value = next
}

// --- the line's acts ---

/**
 * M4's snackbar and its one undo (FR-25.2, FR-25.31), anchored above this
 * screen's ＋: a pack registers, the row leaves, and a mistap is taken back
 * from the snackbar — as on the packing list.
 */
const { rowUndo, announcePacked, announceAct } = usePackAnnouncer(FAB_ANCHOR.m27Excursion)

function restoreCounts(records: RowUndoRecord[]) {
  for (const record of records) {
    const line = lineById.value.get(record.itemId)
    if (line)
      orchestrator.setLineCount(
        props.tripId,
        { ...line, quantity: record.quantity },
        record.packedCount,
      )
  }
}

/** M4's stepper and tick, on the line's own count — each announced like M4's. */
function count(line: ExcursionItem, packed: number) {
  const target = Math.min(Math.max(packed, 0), line.quantity)
  const name = line.name
  rowUndo.actWithUndo(
    [excursionLineAsRow(line)],
    () => orchestrator.setLineCount(props.tripId, line, target),
    restoreCounts,
  )
  void (target >= line.quantity
    ? announcePacked(name)
    : target === 0
      ? announceAct(t('packing.unpackedToast', { name }))
      : announceAct(t('packing.countToast', { name, packed: target, quantity: line.quantity })))
}

function tick(line: ExcursionItem) {
  const reads = stateFor(line.packed_count, line.quantity)
  count(line, reads === 'packed' ? 0 : line.quantity)
}

/** Collapse a leaving row to nothing — M4's `collapseRow`, honouring reduced motion. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
function onRowLeave(el: Element, done: () => void) {
  collapseRow(el as HTMLElement, done, reducedMotion.matches)
}

async function removeLine(line: ExcursionItem) {
  const undo = orchestrator.removeLine(props.tripId, line)
  await presentToast({
    message: t('excursions.lineRemoved', { item: line.name }),
    buttons: [{ text: t('packing.undo'), handler: undo }],
  })
}

/** FR-31.13: bought on the spot, kept — with the one undo the act owes. */
async function keep(line: ExcursionItem) {
  const undo = orchestrator.addToPackingList(props.tripId, line)
  if (!undo) return
  await presentToast({
    message: t('excursions.keptToast', { item: line.name }),
    buttons: [{ text: t('packing.undo'), handler: undo }],
  })
}

/** FR-31.14: a line of the excursion alone becomes an inventory item, undoably. */
async function adopt(line: ExcursionItem) {
  const undo = orchestrator.adoptIntoInventory(props.tripId, line)
  if (!undo) return
  await presentToast({
    message: t('excursions.adoptedToast', { item: line.name }),
    buttons: [{ text: t('packing.undo'), handler: undo }],
  })
}

/**
 * The line whose sheet is open (M5's idiom: a tap opens the detail, a hold
 * opens the menu). The sheet stays on the thing when its strip replaces the line.
 */
const openLineId = ref<string | null>(null)

/**
 * M4's press-and-hold for a line's menu (`useLongPress`; `contextmenu` on a
 * desktop). While the menu lives, the tap its release lands as is ignored,
 * for M4's reason — the release falls on the overlay, not the row.
 */
let menuActive = false
const hold = useLongPress<ExcursionItem>((line) => void openLine(line))
function openSheet(line: ExcursionItem) {
  if (!menuActive) openLineId.value = line.id
}

async function keepOpenLine() {
  const line = lines.value.find((l) => l.id === openLineId.value)
  if (line) await keep(line)
}

async function adoptOpenLine() {
  const line = lines.value.find((l) => l.id === openLineId.value)
  if (line) await adopt(line)
}

async function openLine(line: ExcursionItem) {
  const skipped = line.state === STATE_SKIPPED
  const buttons: Array<{ text: string; role?: string; handler?: () => void; data?: string }> = []
  if (!skipped) {
    buttons.push({
      text: t('excursions.more'),
      handler: () => orchestrator.setLineQuantity(props.tripId, line, line.quantity + 1),
    })
    if (line.quantity > 1) {
      buttons.push({
        text: t('excursions.less'),
        handler: () => orchestrator.setLineQuantity(props.tripId, line, line.quantity - 1),
      })
    }
  }
  if (line.mode === ITEM_MODE_BUY_LOCAL && !skipped) {
    const bought = line.bought_at !== null
    buttons.push({
      text: bought ? t('excursions.markUnbought') : t('excursions.markBought'),
      handler: () => orchestrator.markBought(props.tripId, line, !bought),
    })
  }
  if (canJoinPackingList(line)) {
    buttons.push({ text: t('excursions.keep'), handler: () => void keep(line) })
  }
  if (canAdoptIntoInventory(line)) {
    buttons.push({ text: t('excursions.adoptMenu'), handler: () => void adopt(line) })
  }
  if (line.mode === ITEM_MODE_PACK && line.not_in_luggage && !skipped) {
    buttons.push({
      text: t('excursions.buyOnSite'),
      handler: () => orchestrator.buyOnTheSpot(props.tripId, line),
    })
  }
  buttons.push(
    skipped
      ? { text: t('excursions.unskip'), handler: () => orchestrator.unskipLine(props.tripId, line) }
      : { text: t('excursions.skip'), handler: () => orchestrator.skipLine(props.tripId, line) },
  )
  buttons.push({
    text: t('excursions.remove'),
    role: 'destructive',
    handler: () => void removeLine(line),
  })
  buttons.push({ text: t('common.cancel'), role: 'cancel' })
  const sheet = await actionSheetController.create({ header: line.name, buttons })
  sheet.setAttribute('data-testid', 'excursion-line-menu')
  menuActive = true
  void sheet.onDidDismiss().then(() => (menuActive = false))
  await sheet.present()
}

// --- adding: M4's ＋ and quick-add, over the people going (FR-31.5) ---

const quickAdd = ref<InstanceType<typeof QuickAddItem> | null>(null)
const quickAddExpanded = computed(() => quickAdd.value?.expanded ?? false)
const carriedItemIds = computed(() =>
  lines.value.map((l) => l.source_item_id).filter((id): id is string => id !== null),
)

/**
 * The strip's chosen set as the excursion reads it: nobody is shared, every
 * participant is *für alle* — the set that grows with a joiner — and some are
 * named (FR-31.5).
 */
function forWhomOf(travelerIds: readonly string[]): LineFor {
  if (travelerIds.length === 0) return { kind: 'shared' }
  if (travelerIds.length === participants.value.length) return { kind: 'all' }
  return { kind: 'named', travelerIds }
}

function onQuickAdd(item: BrowseAddition & { travelerIds: string[] }) {
  orchestrator.addLines(
    props.tripId,
    props.excursionId,
    draftLinesFor(
      {
        source_item_id: item.sourceItemId,
        name: item.name,
        category_name: item.categoryName,
        quantity: 1,
        mode: ITEM_MODE_PACK,
        weight_grams: item.weightGrams,
        value_cents: item.valueCents,
        source_template_id: null,
      },
      forWhomOf(item.travelerIds),
      participants.value,
    ),
  )
}

/** FR-31.14: *Nur für diesen Ausflug* — a line no inventory item names, kept out of the suitcase. */
function onQuickAddLocal(item: { name: string; travelerIds: string[] }) {
  orchestrator.addLines(
    props.tripId,
    props.excursionId,
    draftLinesFor(
      {
        source_item_id: null,
        name: item.name,
        category_name: null,
        quantity: 1,
        mode: ITEM_MODE_PACK,
        weight_grams: null,
        value_cents: null,
        source_template_id: null,
      },
      forWhomOf(item.travelerIds),
      participants.value,
    ),
  )
}

function onQuickAddForAll(item: BrowseAddition) {
  onQuickAdd({ ...item, travelerIds: participants.value.map((p) => p.id) })
}

async function onQuickAddGroup(templateId: string) {
  const written = orchestrator.addGroupLines(props.tripId, props.excursionId, templateId)
  const group = masterStore.getTemplate(templateId)
  if (!written || !group) return
  await presentToast({
    message: groupAdditionMessage({
      groupName: group.name,
      added: written.lines,
      alreadyPresent: [],
      unassignable: [],
    }),
    buttons: [{ text: t('packing.undo'), handler: written.undo }],
  })
}

// --- the excursion's own acts, in the bar's ⋮ ---

const editing = ref(false)

async function saveEdit(result: ExcursionSheetResult) {
  editing.value = false
  const ex = excursion.value
  if (!ex) return
  orchestrator.updateExcursion(props.tripId, ex, {
    name: result.name,
    startsOn: result.startsOn,
    endsOn: result.endsOn,
  })
  const before = namesItsParticipants(ex.id, participantRows.value)
    ? participants.value.map((p) => p.id)
    : null
  const same =
    (before === null && result.travelerIds === null) ||
    (before !== null &&
      result.travelerIds !== null &&
      before.length === result.travelerIds.length &&
      before.every((id) => result.travelerIds!.includes(id)))
  if (same) return
  const undo = orchestrator.setParticipants(props.tripId, ex.id, result.travelerIds)
  await presentToast({
    message: t('excursions.participantsChanged'),
    buttons: [{ text: t('packing.undo'), handler: undo }],
  })
}

async function saveAsGroup() {
  const ex = excursion.value
  if (!ex) return
  // FR-31.14: things the inventory does not know join it only if asked to.
  let includeUnlisted = true
  const unlisted = orchestrator.unlistedNames(props.tripId, ex.id)
  if (unlisted.length > 0) {
    const choice = await chooseAction({
      header: t('excursions.unlistedHeader'),
      message: t('excursions.unlistedMessage', { items: unlisted.join(', ') }),
      confirmLabel: t('excursions.unlistedInclude'),
      alternativeLabel: t('excursions.unlistedLeaveOut'),
      testid: 'm27-save-group-unlisted',
    })
    if (choice === null) return
    includeUnlisted = choice
  }
  await promptText({
    header: t('excursions.saveAsGroup'),
    message: t('excursions.saveAsGroupMessage'),
    value: ex.name,
    confirmLabel: t('common.save'),
    testid: 'm27-save-group',
    onConfirm: async (name) => {
      if (!name) return false
      const id = orchestrator.saveAsGroup(props.tripId, ex.id, name, includeUnlisted)
      if (id === null) {
        await presentToast({ message: t('excursions.nameTaken') })
        return false
      }
      await presentToast({ message: t('excursions.savedAsGroup', { name }) })
    },
  })
}

async function remove() {
  const ex = excursion.value
  if (!ex) return
  const ok = await confirmDestructive({
    header: t('excursions.delete'),
    message: t('excursions.deleteConfirm', { name: ex.name }),
    confirmLabel: t('common.delete'),
    testid: 'm27-delete-confirm',
  })
  if (!ok) return
  orchestrator.deleteExcursion(props.tripId, ex.id)
  void router.replace(tripExcursionsPath(props.tripId))
}

setHeaderActions(() =>
  excursion.value
    ? [
        {
          id: 'm27-edit',
          icon: createOutline,
          label: t('excursions.edit'),
          overflow: true,
          onClick: () => (editing.value = true),
        },
        {
          id: 'm27-save-as-group',
          icon: layersOutline,
          label: t('excursions.saveAsGroup'),
          overflow: true,
          onClick: () => void saveAsGroup(),
        },
        {
          id: 'm27-delete',
          icon: trashOutline,
          label: t('excursions.delete'),
          overflow: true,
          onClick: () => void remove(),
        },
      ]
    : [],
)

onMounted(ensure)

setHeaderTitle(
  () => excursion.value?.name,
  () => metaLine.value,
)
</script>

<template>
  <IonPage>
    <IonContent class="excursion-content" data-testid="m27-excursion-page">
      <template v-if="loaded && excursion">
        <!-- M4's progress card and its per-person strip, over the excursion. -->
        <div class="stats jp-card" data-testid="m27-progress-card">
          <ProgressFigure
            class="jp-num"
            :percent="packedPercent({ packedItems: units.done, totalItems: units.total })"
            :headline="
              units.total > 0
                ? t('excursions.packed', { done: units.done, total: units.total })
                : t('excursions.nothingYet')
            "
            :detail="toBuy > 0 ? t('excursions.toBuy', { n: toBuy }) : null"
            :ring-size="RING_SIZE_HEADER"
            headline-testid="m27-figure"
          />
        </div>
        <TravelerProgressStrip
          v-if="showsTravelerProgress(participants)"
          :progress="progressByTraveler(lines, participants)"
          :selected="person === null ? [] : [person]"
          @select="selectPerson"
        />

        <QuickAddItem
          ref="quickAdd"
          :show-trigger="false"
          :offer-groups="true"
          :traveler-count="participants.length"
          :travelers="participants"
          :exclude-item-ids="carriedItemIds"
          :offer-local-only="true"
          @add="onQuickAdd"
          @add-local="onQuickAddLocal"
          @add-for-all="onQuickAddForAll"
          @add-group="onQuickAddGroup"
        />

        <IonList v-if="view.groups.length > 0" class="excursion-list">
          <template v-for="group in view.groups" :key="group.key">
            <button
              class="group-head"
              :class="{ shut: group.collapsed }"
              :data-testid="`m27-group-${group.key || 'none'}`"
              @click="toggleGroup(group.key)"
            >
              <IonIcon :icon="chevronDownOutline" class="caret" />
              <span class="group-name">{{ group.name ?? t('common.none') }}</span>
              <span class="group-count">
                {{
                  group.collapsed
                    ? t('packing.openCount', { n: group.openCount })
                    : `${group.doneCount}/${group.totalCount}`
                }}
              </span>
            </button>

            <!-- FR-25.2 as on M4: a packed row leaves rather than vanishes. -->
            <TransitionGroup
              v-if="!group.collapsed"
              name="pack-out"
              tag="div"
              class="group-card jp-card"
              @leave="onRowLeave"
            >
              <template
                v-for="entry in group.entries"
                :key="entry.kind === 'item' ? entry.item.id : entry.key"
              >
                <div v-if="entry.kind === 'cluster'" class="cluster">
                  <ClusterHead
                    screen="m27"
                    :name="entry.name"
                    :mode="entry.mode"
                    :late="false"
                    :done-count="entry.doneCount"
                    :total-count="entry.totalCount"
                    :open-count="entry.openCount"
                    :collapsed="entry.collapsed"
                    :faces="entry.faces"
                    :master="masterOf(entry.sourceItemId)"
                    @toggle="toggleCluster(entry.key)"
                  />
                  <div v-if="!entry.collapsed" class="cluster-children">
                    <PackingRow
                      v-for="child in entry.children"
                      :key="child.item.id"
                      screen="m27"
                      variant="child"
                      :item="child.item"
                      :label="child.traveler?.name ?? child.label"
                      :test-key="`${entry.name}-${child.traveler?.name ?? ''}`"
                      :done="child.done"
                      :locked="false"
                      :closing-pass="false"
                      :notes="NO_NOTES"
                      :traveler="child.traveler"
                      @open="openSheet(lineOf(child.item))"
                      @menu="openLine(lineOf(child.item))"
                      @press-start="
                        (e: PointerEvent) => hold.down(lineOf(child.item), e.clientX, e.clientY)
                      "
                      @press-move="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                      @press-end="hold.cancel()"
                      @edit-quantity="openSheet(lineOf(child.item))"
                      @increment="count(lineOf(child.item), child.item.packed_count + 1)"
                      @decrement="count(lineOf(child.item), child.item.packed_count - 1)"
                      @complete="count(lineOf(child.item), child.item.quantity)"
                      @zero="count(lineOf(child.item), 0)"
                      @toggle="tick(lineOf(child.item))"
                    >
                      <template #facts>
                        <ExcursionFacts
                          :line="lineOf(child.item)"
                          :test-key="`${entry.name}-${child.traveler?.name ?? ''}`"
                          :from-luggage="suitcaseOf(lineOf(child.item), tripItems) !== null"
                          :left-behind="
                            child.item.packed_count > 0 &&
                            isLeftBehind(lineOf(child.item), participants)
                          "
                          :can-keep="canJoinPackingList(lineOf(child.item))"
                          :can-adopt="canAdoptIntoInventory(lineOf(child.item))"
                          @buy-on-site="orchestrator.buyOnTheSpot(tripId, lineOf(child.item))"
                          @take-out="removeLine(lineOf(child.item))"
                          @keep="keep(lineOf(child.item))"
                          @adopt="adopt(lineOf(child.item))"
                        />
                      </template>
                    </PackingRow>
                  </div>
                </div>

                <PackingRow
                  v-else
                  screen="m27"
                  :item="entry.item"
                  :label="entry.label"
                  :test-key="entry.item.name"
                  :done="entry.done"
                  :locked="false"
                  :closing-pass="false"
                  :notes="NO_NOTES"
                  :traveler="entry.traveler"
                  :master="masterOf(entry.item.source_item_id)"
                  @open="openSheet(lineOf(entry.item))"
                  @menu="openLine(lineOf(entry.item))"
                  @press-start="
                    (e: PointerEvent) => hold.down(lineOf(entry.item), e.clientX, e.clientY)
                  "
                  @press-move="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                  @press-end="hold.cancel()"
                  @edit-quantity="openSheet(lineOf(entry.item))"
                  @increment="count(lineOf(entry.item), entry.item.packed_count + 1)"
                  @decrement="count(lineOf(entry.item), entry.item.packed_count - 1)"
                  @complete="count(lineOf(entry.item), entry.item.quantity)"
                  @zero="count(lineOf(entry.item), 0)"
                  @toggle="tick(lineOf(entry.item))"
                >
                  <template #facts>
                    <ExcursionFacts
                      :line="lineOf(entry.item)"
                      :test-key="entry.item.name"
                      :from-luggage="suitcaseOf(lineOf(entry.item), tripItems) !== null"
                      :can-keep="canJoinPackingList(lineOf(entry.item))"
                      :can-adopt="canAdoptIntoInventory(lineOf(entry.item))"
                      @buy-on-site="orchestrator.buyOnTheSpot(tripId, lineOf(entry.item))"
                      @keep="keep(lineOf(entry.item))"
                      @adopt="adopt(lineOf(entry.item))"
                    />
                  </template>
                </PackingRow>
              </template>
            </TransitionGroup>
          </template>
        </IonList>

        <!-- FR-25.2: state the count, one tap to reveal — M4's bar. -->
        <RevealBar
          v-if="view.doneCount > 0"
          :open="showDone"
          :label="
            showDone
              ? t('packing.hideDone', { n: view.doneCount })
              : t('packing.showDone', { n: view.doneCount })
          "
          testid="m27-done-bar"
          @toggle="showDone = !showDone"
        />
      </template>

      <ExcursionSheet
        :is-open="editing"
        :travelers="travelers"
        :excursion="excursion"
        :traveler-ids="
          excursion && namesItsParticipants(excursion.id, participantRows)
            ? participants.map((p) => p.id)
            : null
        "
        :suitcase-open="suitcaseOpen"
        @dismiss="editing = false"
        @save="saveEdit"
      />

      <!-- M5's sheet, for an excursion's line (FR-31.6). -->
      <SheetModal
        :is-open="openLineId !== null"
        testid="m27-line-modal"
        @dismiss="openLineId = null"
      >
        <ExcursionItemSheet
          v-if="openLineId"
          :trip-id="tripId"
          :line-id="openLineId"
          :participants="participants"
          @close="openLineId = null"
          @keep="keepOpenLine"
          @adopt="adoptOpenLine"
        />
      </SheetModal>

      <IonFab :id="FAB_ANCHOR.m27Excursion" slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton
          v-if="!quickAddExpanded"
          data-testid="m27-add-fab"
          :aria-label="t('common.add')"
          @click="quickAdd?.open()"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.excursion-content {
  --padding-top: 6px;
  /* Room for the FAB over the last row, as on M4. */
  --padding-bottom: 88px;
}

.stats {
  display: flex;
  margin: 4px 8px 8px;
  padding: 10px 8px;
}

.stats > * {
  flex: 1;
  min-width: 0;
}

/* M4's group heads and cards (PackingListPage), so the two lists read alike. */
.excursion-list {
  padding: 0;
  background: transparent;
}

.group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 20px 6px 8px;
  background: none;
  border: none;
  color: var(--ct-text);
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-bold);
  letter-spacing: var(--jp-tracking-display);
  cursor: pointer;
}

.group-name {
  flex: 1;
  text-align: start;
}

.group-count {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-medium);
}

.group-card {
  margin: 0 8px;
}

.group-card ion-item {
  --padding-start: 12px;
  --inner-padding-end: 10px;
}

.caret {
  transition: transform 0.18s ease;
}

.group-head.shut .caret {
  transform: rotate(-90deg);
}

.pack-out-leave-active {
  transition:
    height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.3s ease,
    background-color 0.3s ease;
  overflow: hidden;
  pointer-events: none;
}

.pack-out-leave-from {
  background: color-mix(in srgb, var(--jp-done) 22%, transparent);
}

.pack-out-leave-to {
  opacity: 0;
}

.pack-out-move {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .pack-out-leave-active,
  .pack-out-move {
    transition: none;
  }

  .pack-out-leave-from {
    background: none;
  }
}

.cluster-children {
  border-inline-start: 2px solid var(--ct-surface1);
  margin-inline-start: 12px;
}
</style>
