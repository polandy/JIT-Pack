<script setup lang="ts">
/**
 * One excursion's list (FR-31.6) — a lean M4 for the rucksack: its lines by
 * category, a thing per person as FR-25.1's cluster, a tick each, and a
 * composer that asks *für wen* over the people going (FR-31.5). What a line
 * needs done stands on the line (FR-31.7, FR-31.5); what the excursion needs
 * done — edit it, save it as a Gruppe, delete it — is in the bar's ⋮.
 */
import { IonContent, IonIcon, IonPage, actionSheetController } from '@ionic/vue'
import { chevronDownOutline, createOutline, layersOutline, trashOutline } from 'ionicons/icons'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import ForWhomToggles from '@/components/global/ForWhomToggles.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import ListComposer from '@/components/global/ListComposer.vue'
import ListGroup from '@/components/global/ListGroup.vue'
import ProgressFigure from '@/components/global/ProgressFigure.vue'
import ExcursionLine from '@/components/trips/ExcursionLine.vue'
import ExcursionSheet, { type ExcursionSheetResult } from '@/components/trips/ExcursionSheet.vue'
import { setHeaderActions } from '@/composables/useHeaderActions'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripScreen } from '@/composables/useTripScreen'
import {
  draftLinesFor,
  excursionView,
  isLeftBehind,
  isOpenPurchase,
  namesItsParticipants,
  participantsOf,
  spanOf,
  suitcaseOf,
  sumUnits,
  type LineFor,
} from '@/domain/excursions'
import { packedPercent } from '@/domain/packState'
import { t } from '@/i18n'
import { confirmDestructive, promptText } from '@/lib/confirm'
import { excursionDays } from '@/lib/excursionText'
import { presentToast } from '@/lib/toast'
import { beforeIsOver, standingOf } from '@/lib/tripPhase'
import { tripExcursionsPath } from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ExcursionItem } from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK, STATE_SKIPPED } from '@/types/domain'

const props = defineProps<{ tripId: string; excursionId: string }>()

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
const groups = computed(() => excursionView(lines.value, participants.value))
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

function personOf(line: ExcursionItem) {
  const person = travelers.value.find((tr) => tr.id === line.assigned_traveler_id)
  return person ? { id: person.id, name: person.name } : null
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

async function removeLine(line: ExcursionItem) {
  const undo = orchestrator.removeLine(props.tripId, line)
  await presentToast({
    message: t('excursions.lineRemoved', { item: line.name }),
    buttons: [{ text: t('packing.undo'), handler: undo }],
  })
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
  await sheet.present()
}

// --- the composer (FR-31.5) ---

const draft = ref('')
const chosen = ref(new Set<string>())

const composerFor = computed<LineFor>(() => {
  const ids = participants.value.map((p) => p.id).filter((id) => chosen.value.has(id))
  if (ids.length === 0) return { kind: 'shared' }
  if (ids.length === participants.value.length) return { kind: 'all' }
  return { kind: 'named', travelerIds: ids }
})
const composerAmounts = computed(() => new Map([...chosen.value].map((id) => [id, 1])))
const composerSentence = computed(() =>
  chosen.value.size === 0 ? t('forWhom.addShared') : t('forWhom.addFor', { n: chosen.value.size }),
)

function chooseShared() {
  chosen.value = new Set()
}
function chooseAll() {
  chosen.value = new Set(participants.value.map((p) => p.id))
}
function chooseOne(id: string) {
  const next = new Set(chosen.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  chosen.value = next
}

/** A typed name that is an inventory item brings its mark, category and link. */
function addTyped() {
  const name = draft.value.trim()
  if (!name) return
  const master = masterStore.activeItemList.find(
    (m) => m.name.trim().toLowerCase() === name.toLowerCase(),
  )
  orchestrator.addLines(
    props.tripId,
    props.excursionId,
    draftLinesFor(
      {
        source_item_id: master?.id ?? null,
        name: master?.name ?? name,
        category_name: master ? masterStore.categoryOf(master.id) : null,
        quantity: 1,
        mode: ITEM_MODE_PACK,
        weight_grams: master?.weight_grams ?? null,
        value_cents: master?.value_cents ?? null,
        source_template_id: null,
      },
      composerFor.value,
      participants.value,
    ),
  )
  draft.value = ''
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
        <div class="figure">
          <ProgressFigure
            :percent="packedPercent({ packedItems: units.done, totalItems: units.total })"
            :headline="
              units.total > 0
                ? t('excursions.packed', { done: units.done, total: units.total })
                : t('excursions.nothingYet')
            "
            :detail="toBuy > 0 ? t('excursions.toBuy', { n: toBuy }) : null"
            :ring-size="44"
            headline-testid="m27-figure"
          />
        </div>

        <ListGroup
          v-for="group in groups"
          :key="group.category ?? ''"
          :title="group.category ?? t('facet.noCategory')"
          :count="group.units.total"
          head-testid="m27-group-head"
        >
          <template
            v-for="entry in group.entries"
            :key="entry.kind === 'line' ? entry.line.id : entry.key"
          >
            <ExcursionLine
              v-if="entry.kind === 'line'"
              :line="entry.line"
              :master="masterOf(entry.line.source_item_id)"
              :from-luggage="suitcaseOf(entry.line, tripItems) !== null"
              @tick="tick(entry.line)"
              @open="openLine(entry.line)"
              @buy-on-site="orchestrator.buyOnTheSpot(tripId, entry.line)"
            />
            <template v-else>
              <button
                type="button"
                class="cluster-head"
                :aria-expanded="openClusters.has(entry.key)"
                :data-testid="`excursion-cluster-${entry.key}`"
                @click="toggleCluster(entry.key)"
              >
                <ItemMark
                  :mark="masterOf(entry.lines[0]!.source_item_id)?.icon ?? null"
                  surface="packing"
                  :photo-item="masterOf(entry.lines[0]!.source_item_id)"
                  :size="22"
                />
                <span class="cluster-name">
                  {{ entry.name }}
                  <IonIcon
                    :icon="chevronDownOutline"
                    class="caret"
                    :class="{ shut: !openClusters.has(entry.key) }"
                    aria-hidden="true"
                  />
                  <small v-if="entry.forAll">{{ t('excursions.forAll') }}</small>
                </span>
                <span
                  class="cluster-count jp-num"
                  :data-testid="`excursion-cluster-count-${entry.key}`"
                >
                  {{ entry.units.done }}/{{ entry.units.total }}
                </span>
              </button>
              <template v-if="openClusters.has(entry.key)">
                <ExcursionLine
                  v-for="line in entry.lines"
                  :key="line.id"
                  class="child"
                  :line="line"
                  :person="personOf(line)"
                  :from-luggage="suitcaseOf(line, tripItems) !== null"
                  :left-behind="line.packed_count > 0 && isLeftBehind(line, participants)"
                  @tick="tick(line)"
                  @open="openLine(line)"
                  @buy-on-site="orchestrator.buyOnTheSpot(tripId, line)"
                  @take-out="removeLine(line)"
                />
              </template>
            </template>
          </template>
        </ListGroup>

        <div class="composer">
          <ForWhomToggles
            v-if="participants.length > 1"
            :travelers="participants"
            :amounts="composerAmounts"
            test-key="m27"
            @shared="chooseShared"
            @all="chooseAll"
            @toggle="chooseOne"
          />
          <p v-if="participants.length > 1" class="sentence" data-testid="m27-for-whom-sentence">
            {{ composerSentence }}
          </p>
          <ListComposer
            v-model="draft"
            :placeholder="t('excursions.addPlaceholder')"
            :label="t('excursions.addLabel')"
            :add-label="t('excursions.addAction')"
            testid="m27-composer"
            input-testid="m27-composer-input"
            submit-testid="m27-composer-add"
            @submit="addTyped"
          />
        </div>
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
    </IonContent>
  </IonPage>
</template>

<style scoped>
.excursion-content {
  --padding-top: 6px;
  --padding-bottom: 24px;
}

.figure {
  padding: 4px 16px 8px;
}

.cluster-head {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  border: 0;
  background: var(--jp-surface-card);
  color: var(--ct-text);
  text-align: start;
  cursor: pointer;
}

.cluster-name {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-weight: var(--jp-weight-semibold);
}

.cluster-name small {
  flex-basis: 100%;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-regular);
}

.caret {
  width: var(--jp-icon-sm);
  height: var(--jp-icon-sm);
  color: var(--ct-subtext0);
  transition: transform 0.15s ease;
}

.caret.shut {
  transform: rotate(-90deg);
}

.cluster-count {
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.child {
  --padding-start: 34px;
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 18px 12px 0;
}

.sentence {
  margin: 0 4px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}
</style>
