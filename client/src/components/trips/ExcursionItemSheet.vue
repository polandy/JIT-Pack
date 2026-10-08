<script setup lang="ts">
/**
 * One excursion line in detail (FR-31.6) — M5's sheet, for the rucksack.
 *
 * It is laid out and styled as M5 is, block for block, because the excursion's
 * list is the packing list, smaller: the line's identity with its mark, the
 * amount, **packing** as the largest control with the state beside it, the
 * skip, a glance row of what the line is, what it needs done (`ExcursionFacts`),
 * and *Details ▾* for the one attribute a line can change — how it is had,
 * packed or bought on the spot. What M5 has and a line has not — preparations,
 * notes, a packer, a container, flags — is left out rather than shown inert.
 *
 * Every control commits at once (G-5), as in M5.
 */
import {
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonToggle,
} from '@ionic/vue'
import { chevronForwardOutline, closeCircleOutline, refreshOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import FactChip from '@/components/global/FactChip.vue'
import ForWhomToggles from '@/components/global/ForWhomToggles.vue'
import QuantityEditor from '@/components/global/QuantityEditor.vue'
import QuantityStepper from '@/components/global/QuantityStepper.vue'
import SaveIndicator from '@/components/global/SaveIndicator.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import ExcursionFacts from '@/components/trips/ExcursionFacts.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import {
  canAdoptIntoInventory,
  canJoinPackingList,
  lineSetOf,
  suitcaseOf,
  type LineFor,
} from '@/domain/excursions'
import { MIN_TRAVELERS_FOR_PER_PERSON } from '@/domain/membership'
import { quantityChoices } from '@/domain/quantityChoices'
import { t } from '@/i18n'
import { modeIcon, modeLabel } from '@/lib/modeLabels'
import { stateLabel } from '@/lib/stateLabels'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ExcursionItemMode, Traveler } from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK, STATE_SKIPPED } from '@/types/domain'

/** The two ways an excursion line is had (FR-31.8), in M5's order. */
const LINE_MODES: readonly ExcursionItemMode[] = [ITEM_MODE_PACK, ITEM_MODE_BUY_LOCAL]

const props = defineProps<{
  tripId: string
  lineId: string
  /** Who goes (FR-31.3) — the strip's people and the quick amounts' „one each". */
  participants: Traveler[]
}>()

const emit = defineEmits<{
  close: []
  /** FR-31.13: taken onto the packing list — the host owns the toast and its undo. */
  keep: []
  adopt: []
}>()

const tripStore = useTripStore()
const masterStore = useMasterStore()
const orchestrator = useOrchestrator()

/**
 * The line the sheet was opened on — or, once the strip below has replaced it
 * (shared ↔ per person), a line of the same thing, so the sheet stays on what
 * it was opened for rather than closing under the finger.
 */
const opened = tripStore.getExcursionItems(props.tripId).find((l) => l.id === props.lineId) ?? null
const line = computed(() => {
  const all = tripStore.getExcursionItems(props.tripId)
  return all.find((l) => l.id === props.lineId) ?? (opened ? lineSetOf(opened, all)[0] : undefined)
})
const set = computed(() =>
  line.value ? lineSetOf(line.value, tripStore.getExcursionItems(props.tripId)) : [],
)
/** FR-25.28 in the sheet, as on M5: the strip where two or more go (G-8). */
const offersForWhom = computed(() => props.participants.length >= MIN_TRAVELERS_FOR_PER_PERSON)
const members = computed(
  () =>
    new Map(
      set.value
        .filter((l) => l.assigned_traveler_id !== null)
        .map((l) => [l.assigned_traveler_id!, l.quantity]),
    ),
)

function forWhom(target: LineFor) {
  if (line.value) orchestrator.setForWhom(props.tripId, line.value, target)
}

function toggleMember(travelerId: string) {
  const next = new Set(members.value.keys())
  if (next.has(travelerId)) next.delete(travelerId)
  else next.add(travelerId)
  if (next.size === 0) forWhom({ kind: 'shared' })
  else if (next.size === props.participants.length) forWhom({ kind: 'all' })
  else forWhom({ kind: 'named', travelerIds: [...next] })
}
const master = computed(() =>
  line.value?.source_item_id ? (masterStore.getItem(line.value.source_item_id) ?? null) : null,
)
const person = computed(
  () =>
    tripStore.getTravelers(props.tripId).find((tr) => tr.id === line.value?.assigned_traveler_id) ??
    null,
)
const fromLuggage = computed(() =>
  line.value ? suitcaseOf(line.value, tripStore.getItems(props.tripId)) !== null : false,
)
const isSkipped = computed(() => line.value?.state === STATE_SKIPPED)
const detailsOpen = ref(false)

/** M5's context line: the category, and whose line it is. */
const contextLine = computed(() =>
  [line.value?.category_name, person.value?.name]
    .filter((part): part is string => !!part)
    .join(' · '),
)

const choices = computed(() =>
  quantityChoices({
    durationDays: null,
    travelerCount: props.participants.length,
    perPerson: line.value?.assigned_traveler_id != null,
  }),
)

function count(packed: number) {
  if (!line.value) return
  orchestrator.setLineCount(line.value, Math.min(Math.max(packed, 0), line.value.quantity))
}

function onSkipToggle() {
  if (!line.value) return
  if (isSkipped.value) orchestrator.unskipLine(line.value)
  else orchestrator.skipLine(line.value)
}

function onModeChange(mode: ExcursionItemMode) {
  if (!line.value || mode === line.value.mode) return
  orchestrator.setLineMode(line.value, mode)
}
</script>

<template>
  <section v-if="line" class="sheet-body" data-testid="m27-line-sheet">
    <SheetHead
      :title="line.name"
      :meta="contextLine"
      title-testid="m27-line-name"
      close-testid="m27-line-close"
      @close="emit('close')"
    >
      <template #lead>
        <ItemMark
          :mark="master?.icon ?? null"
          surface="plain"
          :photo-item="master"
          :size="44"
          class="thumb"
        />
      </template>
      <template #trail>
        <SaveIndicator :key="lineId" :pending="orchestrator.capturePending.value" />
      </template>
    </SheetHead>

    <template v-if="!isSkipped">
      <h2 class="sl">{{ t('quantity.title') }}</h2>
      <div class="qty-block" data-testid="m27-line-quantity">
        <QuantityEditor
          :quantity="line.quantity"
          :packed="line.packed_count"
          :choices="choices"
          @update="(q: number) => orchestrator.setLineQuantity(line!, q)"
        />
      </div>
    </template>

    <h2 class="sl">{{ t('packing.packSection') }}</h2>
    <div class="pack" data-testid="m27-line-pack">
      <QuantityStepper
        :quantity="line.quantity"
        :packed="line.packed_count"
        :large="true"
        @increment="count(line.packed_count + 1)"
        @decrement="count(line.packed_count - 1)"
        @complete="count(line.quantity)"
        @zero="count(0)"
        @toggle="orchestrator.toggleLine(line)"
      />
      <span class="state" :class="line.state">{{ stateLabel(line.state) }}</span>
    </div>

    <button
      class="skip-toggle"
      :class="{ on: isSkipped }"
      data-testid="m27-line-skip"
      @click="onSkipToggle"
    >
      <IonIcon :icon="isSkipped ? refreshOutline : closeCircleOutline" />
      {{ isSkipped ? t('packing.unskipAction') : t('packing.skipAction') }}
    </button>

    <!-- M5's strip, over the people going: the thing becomes shared, one per
         person *für alle*, or named people's (FR-31.5). -->
    <div v-if="offersForWhom" class="for-whom" data-testid="m27-line-for-whom">
      <ForWhomToggles
        :travelers="participants"
        :amounts="members"
        test-key="m27-line"
        @shared="forWhom({ kind: 'shared' })"
        @all="forWhom({ kind: 'all' })"
        @toggle="toggleMember"
      />
    </div>

    <div class="glance" data-testid="m27-line-glance">
      <FactChip v-if="!offersForWhom">
        <UserAvatar v-if="person" :name="person.name" :seed="person.id" :size="20" />
        {{ person?.name ?? t('facet.shared') }}
      </FactChip>
      <FactChip :tone="line.mode === ITEM_MODE_BUY_LOCAL ? 'buy' : null">
        <IonIcon v-if="modeIcon(line.mode)" :icon="modeIcon(line.mode)!" />
        {{ modeLabel(line.mode) }}
      </FactChip>
    </div>

    <div class="facts-block">
      <ExcursionFacts
        :line="line"
        :test-key="`sheet-${line.name}`"
        :from-luggage="fromLuggage"
        :can-keep="canJoinPackingList(line)"
        :can-adopt="canAdoptIntoInventory(line)"
        @buy-on-site="orchestrator.buyOnTheSpot(line)"
        @keep="emit('keep')"
        @adopt="emit('adopt')"
      />
    </div>

    <button
      class="details"
      :class="{ open: detailsOpen }"
      data-testid="m27-line-details"
      @click="detailsOpen = !detailsOpen"
    >
      <IonIcon :icon="chevronForwardOutline" class="caret" />
      <span class="details-label">{{ t('item.details') }}</span>
      <span v-if="!detailsOpen" class="details-hint">{{ t('excursions.detailsHint') }}</span>
    </button>

    <IonList v-if="detailsOpen" class="details-body">
      <IonItem>
        <IonLabel>{{ t('facet.mode') }}</IonLabel>
        <IonSelect
          :value="line.mode"
          interface="popover"
          data-testid="m27-line-mode"
          @ion-change="(e: CustomEvent) => onModeChange(e.detail.value)"
        >
          <IonSelectOption v-for="m in LINE_MODES" :key="m" :value="m">{{
            modeLabel(m)
          }}</IonSelectOption>
        </IonSelect>
      </IonItem>
      <IonItem v-if="line.mode === ITEM_MODE_BUY_LOCAL">
        <IonLabel>{{ t('excursions.markBought') }}</IonLabel>
        <IonToggle
          slot="end"
          :checked="line.bought_at !== null"
          data-testid="m27-line-bought"
          @ion-change="(e: CustomEvent) => orchestrator.markBought(line!, e.detail.checked)"
        />
      </IonItem>
    </IonList>
  </section>

  <section v-else class="missing" data-testid="m27-line-missing">
    <p>{{ t('item.notFound') }}</p>
  </section>
</template>

<style scoped>
/* M5's own blocks (ItemDetailSheet.vue), so the two sheets read as one. */
.sheet-body {
  padding: 4px 16px 24px;
}

.thumb {
  flex: none;
  border-radius: var(--jp-r-sm);
  overflow: hidden;
}

.sl {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-semibold);
  letter-spacing: var(--jp-tracking-label);
  text-transform: uppercase;
  color: var(--ct-subtext0);
}

.qty-block {
  padding: 14px 12px;
  margin-bottom: 16px;
  border-radius: var(--jp-r);
  background: var(--ct-surface0);
}

.pack {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  border-radius: var(--jp-r);
  background: var(--ct-surface0);
}

.state {
  margin-left: auto;
  padding: 5px 10px;
  border-radius: var(--jp-r-pill);
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-bold);
  background: color-mix(in srgb, var(--ct-pine) 16%, transparent);
  color: var(--ct-pine);
}

.state.open,
.state.partial {
  background: color-mix(in srgb, var(--ct-straw) 16%, transparent);
  color: var(--ct-straw);
}

.skip-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
  padding: 11px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r);
  background: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.skip-toggle ion-icon {
  font-size: var(--jp-icon-sm);
}

.skip-toggle.on {
  border-color: var(--ct-pine);
  color: var(--ct-pine);
}

.for-whom {
  margin-top: 8px;
  padding: 10px 8px;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.glance {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 12px 0 2px;
}

.facts-block {
  padding: 4px 2px 10px;
}

.details {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 14px 2px;
  background: none;
  border: none;
  border-top: 1px solid var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-md);
  cursor: pointer;
}

.details .caret {
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-xs);
  transition: transform 0.18s ease;
}

.details.open .caret {
  transform: rotate(90deg);
}

.details-label {
  flex: none;
}

.details-hint {
  flex: 1;
  text-align: end;
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
  color: var(--ct-overlay0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.details-body {
  background: transparent;
}

.missing {
  padding: 32px 16px;
  text-align: center;
  color: var(--ct-subtext0);
}
</style>
