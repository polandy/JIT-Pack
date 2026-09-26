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
import { useTripScreen } from '@/composables/useTripScreen'
import {
  canJoinPackingList,
  draftLinesFor,
  excursionLineAsRow,
  excursionView,
  isLeftBehind,
  isOpenPurchase,
  namesItsParticipants,
  participantsOf,
  spanOf,
  suitcaseOf,
  sumUnits,
  type ExcursionEntry,
  type LineFor,
} from '@/domain/excursions'
import { NO_VALUE } from '@/domain/packingView'
import { packedPercent } from '@/domain/packState'
import { progressByTraveler, showsTravelerProgress } from '@/domain/travelerProgress'
import { t } from '@/i18n'
import { confirmDestructive, promptText } from '@/lib/confirm'
import { excursionDays } from '@/lib/excursionText'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { groupAdditionMessage } from '@/lib/groupAdditionMessage'
import { presentToast } from '@/lib/toast'
import { beforeIsOver, standingOf } from '@/lib/tripPhase'
import { tripExcursionsPath } from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ExcursionItem, Traveler } from '@/types/domain'
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
const shownLines = computed(() =>
  person.value === null
    ? lines.value
    : lines.value.filter((l) => (l.assigned_traveler_id ?? NO_VALUE) === person.value),
)
const groups = computed(() => excursionView(shownLines.value, participants.value))
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

function personOf(line: ExcursionItem): Traveler | null {
  return travelers.value.find((tr) => tr.id === line.assigned_traveler_id) ?? null
}

/** A line says nothing in M4's own note slots — its facts are its own. */
const NO_NOTES: PackingRowNotes = {
  lock: null,
  ownClaim: null,
  skipped: null,
  packed: null,
  responsible: null,
}

function isDone(line: ExcursionItem): boolean {
  return line.state === STATE_SKIPPED || line.packed_count >= line.quantity
}

/** FR-25.23's shut head: a face per instance, ringed once it is dealt with. */
function facesOf(entry: Extract<ExcursionEntry, { kind: 'cluster' }>) {
  return entry.lines.map((line) => ({ traveler: personOf(line), done: isDone(line) }))
}

// --- the fold of a group (view state, as on M4) ---

const shutGroups = ref(new Set<string>())
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

function tick(line: ExcursionItem) {
  orchestrator.toggleLine(props.tripId, line)
}

/** M4's stepper, on the line's own count. */
function count(line: ExcursionItem, packed: number) {
  orchestrator.setLineCount(props.tripId, line, Math.min(Math.max(packed, 0), line.quantity))
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
  await promptText({
    header: t('excursions.saveAsGroup'),
    message: t('excursions.saveAsGroupMessage'),
    value: ex.name,
    confirmLabel: t('common.save'),
    testid: 'm27-save-group',
    onConfirm: async (name) => {
      if (!name) return false
      const id = orchestrator.saveAsGroup(props.tripId, ex.id, name)
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
          @add="onQuickAdd"
          @add-for-all="onQuickAddForAll"
          @add-group="onQuickAddGroup"
        />

        <IonList v-if="groups.length > 0" class="excursion-list">
          <template v-for="group in groups" :key="group.category ?? ''">
            <button
              class="group-head"
              :class="{ shut: shutGroups.has(group.category ?? '') }"
              :data-testid="`m27-group-${group.category ?? 'none'}`"
              @click="toggleGroup(group.category ?? '')"
            >
              <IonIcon :icon="chevronDownOutline" class="caret" />
              <span class="group-name">{{ group.category ?? t('common.none') }}</span>
              <span class="group-count">{{ group.units.done }}/{{ group.units.total }}</span>
            </button>

            <div v-if="!shutGroups.has(group.category ?? '')" class="group-card jp-card">
              <template
                v-for="entry in group.entries"
                :key="entry.kind === 'line' ? entry.line.id : entry.key"
              >
                <PackingRow
                  v-if="entry.kind === 'line'"
                  screen="m27"
                  :item="excursionLineAsRow(entry.line)"
                  :label="entry.line.name"
                  :test-key="entry.line.name"
                  :done="isDone(entry.line)"
                  :locked="false"
                  :closing-pass="false"
                  :notes="NO_NOTES"
                  :master="masterOf(entry.line.source_item_id)"
                  @open="openSheet(entry.line)"
                  @menu="openLine(entry.line)"
                  @press-start="(e: PointerEvent) => hold.down(entry.line, e.clientX, e.clientY)"
                  @press-move="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                  @press-end="hold.cancel()"
                  @edit-quantity="openLine(entry.line)"
                  @increment="count(entry.line, entry.line.packed_count + 1)"
                  @decrement="count(entry.line, entry.line.packed_count - 1)"
                  @complete="count(entry.line, entry.line.quantity)"
                  @zero="count(entry.line, 0)"
                  @toggle="tick(entry.line)"
                >
                  <template #facts>
                    <ExcursionFacts
                      :line="entry.line"
                      :test-key="entry.line.name"
                      :from-luggage="suitcaseOf(entry.line, tripItems) !== null"
                      :can-keep="canJoinPackingList(entry.line)"
                      @buy-on-site="orchestrator.buyOnTheSpot(tripId, entry.line)"
                      @keep="keep(entry.line)"
                    />
                  </template>
                </PackingRow>

                <div v-else class="cluster">
                  <ClusterHead
                    screen="m27"
                    :name="entry.name"
                    :mode="entry.lines[0]!.mode"
                    :late="false"
                    :done-count="entry.units.done"
                    :total-count="entry.units.total"
                    :open-count="entry.units.total - entry.units.done"
                    :collapsed="!openClusters.has(entry.key)"
                    :faces="facesOf(entry)"
                    :master="masterOf(entry.lines[0]!.source_item_id)"
                    @toggle="toggleCluster(entry.key)"
                  />
                  <div v-if="openClusters.has(entry.key)" class="cluster-children">
                    <PackingRow
                      v-for="line in entry.lines"
                      screen="m27"
                      :key="line.id"
                      variant="child"
                      :item="excursionLineAsRow(line)"
                      :label="personOf(line)?.name ?? line.name"
                      :test-key="`${entry.name}-${personOf(line)?.name ?? ''}`"
                      :done="isDone(line)"
                      :locked="false"
                      :closing-pass="false"
                      :notes="NO_NOTES"
                      :traveler="personOf(line)"
                      @open="openSheet(line)"
                      @menu="openLine(line)"
                      @press-start="(e: PointerEvent) => hold.down(line, e.clientX, e.clientY)"
                      @press-move="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                      @press-end="hold.cancel()"
                      @edit-quantity="openLine(line)"
                      @increment="count(line, line.packed_count + 1)"
                      @decrement="count(line, line.packed_count - 1)"
                      @complete="count(line, line.quantity)"
                      @zero="count(line, 0)"
                      @toggle="tick(line)"
                    >
                      <template #facts>
                        <ExcursionFacts
                          :line="line"
                          :test-key="`${entry.name}-${personOf(line)?.name ?? ''}`"
                          :from-luggage="suitcaseOf(line, tripItems) !== null"
                          :left-behind="line.packed_count > 0 && isLeftBehind(line, participants)"
                          :can-keep="canJoinPackingList(line)"
                          @buy-on-site="orchestrator.buyOnTheSpot(tripId, line)"
                          @take-out="removeLine(line)"
                          @keep="keep(line)"
                        />
                      </template>
                    </PackingRow>
                  </div>
                </div>
              </template>
            </div>
          </template>
        </IonList>
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

.cluster-children {
  border-inline-start: 2px solid var(--ct-surface1);
  margin-inline-start: 12px;
}
</style>
