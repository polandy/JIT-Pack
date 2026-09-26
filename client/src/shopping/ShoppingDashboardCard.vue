<script setup lang="ts">
/**
 * A trip's shopping list on the dashboard, and workable there (FR-30.7).
 *
 * M1 otherwise only reports (FR-7.4's ruling); the shopping list is the one
 * exception, because it is opened in the shop — where a detour through the
 * trip is the thing nobody wants. So this card
 * checks lines off and takes new entries, and leaves everything else to M6:
 * removing, the bought reveal and its stamps.
 *
 * It shows one of the two lists — the one that is *now*: at the destination
 * for a running trip, before departure for a planned one — with a chip to
 * switch, and at most five lines. A planned trip with nothing to buy shows no
 * card at all, so the list of what comes next stays a list.
 *
 * It lives in the shopping module and reaches M1 through `lib/tripCards.ts`
 * (FR-30.3): M1 renders it without importing it.
 */
import { IonCheckbox, IonIcon } from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import DashboardBlock from '@/components/global/DashboardBlock.vue'
import DashboardBlockRow from '@/components/global/DashboardBlockRow.vue'
import DueBadge from '@/components/global/DueBadge.vue'
import InlineHint from '@/components/global/InlineHint.vue'

import { useOrchestrator } from '@/composables/useOrchestrator'
import { t } from '@/i18n'
import { isPressingDay, sortByDue } from '@/lib/dueDay'
import { SHOPPING_SOURCES, type ShoppingLine } from '@/lib/shoppingSources'
import { presentToast } from '@/lib/toast'
import type { TripCardProps } from '@/lib/tripCards'
import { tripSubPath } from '@/router/paths'
import type { ShoppingMode } from '@/types/domain'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL } from '@/types/domain'
import { createShoppingActions, ownEntriesSource } from './actions'
import { listInFocus } from './list'
import { useShoppingStore } from './store'

const props = defineProps<TripCardProps>()

/** The block's remembered fold (`lib/blockFold.ts`). */
const SHOPPING_FOLD_KEY = 'shopping'

/** How many lines the card shows before it hands over to M6 — seven as a block of the hero (FR-7.10). */
const MAX_LINES = props.embedded ? 7 : 5

const orchestrator = useOrchestrator()
const shoppingStore = useShoppingStore()
const actions = createShoppingActions(orchestrator.moduleHost)
const own = ownEntriesSource(shoppingStore, actions)
const sources = inject(SHOPPING_SOURCES, [])

/** The list that is *now* for this trip (FR-30.8); the chip switches it. */
const list = ref<ShoppingMode>(
  listInFocus(
    { planned: props.planned, packingClosed: props.packingClosed, startDate: props.startDate },
    orchestrator.today(),
  ),
)

/** Today as the device reckons it — what a due day is read against (FR-30.10). */
const today = computed(() => orchestrator.today())

/**
 * Own entries first, as on M6; a source's lines after them. FR-30.10, M1's
 * rule for a task (FR-7.11): what is pressing — overdue, today, the next two
 * days — leads, earliest first; everything else keeps that order.
 */
function linesOf(which: ShoppingMode): { line: ShoppingLine; own: boolean }[] {
  const all = [
    ...own.open(props.tripId, which).map((line) => ({ line, own: true })),
    ...sources.flatMap((source) =>
      source.open(props.tripId, which).map((line) => ({ line, own: false })),
    ),
  ]
  return sortByDue(all, today.value, ({ line }) =>
    isPressingDay(line.dueDate ?? null, today.value) ? (line.dueDate ?? null) : null,
  )
}

const before = computed(() => linesOf(ITEM_MODE_BUY_BEFORE))
const local = computed(() => linesOf(ITEM_MODE_BUY_LOCAL))
const lines = computed(() => (list.value === ITEM_MODE_BUY_BEFORE ? before.value : local.value))
const shown = computed(() => lines.value.slice(0, MAX_LINES))

/** ADR-033: an empty list is only said once the trip's rows are here. */
const loaded = computed(() => orchestrator.tripDataLoaded(props.tripId))

/** A planned trip with nothing to buy has no card; a running one always has. */
const visible = computed(
  () => !props.planned || before.value.length + local.value.length > 0 || !loaded.value,
)

/**
 * The last purchase, for the card's own undo — a snackbar would stand over
 * the dashboard's other cards, and the mistake is in this one.
 */
const lastBought = ref<ShoppingLine | null>(null)

function buy(line: ShoppingLine) {
  line.buy()
  lastBought.value = line
}

function undo() {
  lastBought.value?.unbuy()
  lastBought.value = null
}

const draft = ref('')

function add() {
  if (draft.value.trim() === '') return
  actions.addEntry(props.tripId, list.value, draft.value)
  draft.value = ''
  lastBought.value = null
}

/** FR-7.10: the block's own field — the confirmation is what a folded block has to show. */
function addFromBlock(text: string) {
  actions.addEntry(props.tripId, list.value, text)
  lastBought.value = null
  void presentToast({ message: t('shopping.addedToList', { name: text }) })
}

/** What kind of line it is, under its name: how many, then where it came from. */
function subOf(line: ShoppingLine, isOwn: boolean): string | null {
  const parts = [
    line.quantity > 1 ? `${line.quantity}×` : null,
    isOwn ? line.tag : t('shopping.fromPacking'),
  ].filter(Boolean)
  return parts.join(' · ') || null
}

const blockEmpty = computed(() =>
  loaded.value && lines.value.length === 0
    ? t(list.value === ITEM_MODE_BUY_BEFORE ? 'shopping.emptyBefore' : 'shopping.emptyLocal')
    : null,
)

function switchTo(which: ShoppingMode) {
  list.value = which
  lastBought.value = null
}
</script>

<template>
  <!-- FR-7.10: a block of the hero, drawn by the same object as the task block. -->
  <template v-if="visible && embedded">
    <DashboardBlock
      :title="t('shopping.title')"
      :count="lines.length"
      :fold-key="SHOPPING_FOLD_KEY"
      :add-label="t('shopping.addPlaceholder')"
      :more-route="tripSubPath(tripId, 'shopping')"
      :more-label="
        lines.length > MAX_LINES
          ? t('shopping.moreLines', { n: lines.length - MAX_LINES })
          : t('shopping.openList')
      "
      :empty="blockEmpty"
      :testid="`dashboard-shopping-${tripName}`"
      @add="addFromBlock"
    >
      <DashboardBlockRow
        v-for="{ line, own: isOwn } in shown"
        :key="line.key"
        :title="line.name"
        :sub="subOf(line, isOwn)"
        :check-label="t('shopping.bought', { name: line.name })"
        testid="dash-shop-row"
        @check="buy(line)"
      >
        <template v-if="line.dueDate" #lead>
          <DueBadge :day="line.dueDate" :today="today" :testid="`dash-shop-due-${line.name}`" />
        </template>
      </DashboardBlockRow>
    </DashboardBlock>
    <div v-if="lastBought" class="undo" data-testid="dash-shop-undo">
      <span>{{ t('shopping.boughtUndoable', { name: lastBought.name }) }}</span>
      <button type="button" data-testid="dash-shop-undo-button" @click="undo">
        {{ t('packing.undo') }}
      </button>
    </div>
  </template>
  <section
    v-else-if="visible"
    class="jp-card shop-card"
    :data-testid="`dashboard-shopping-${tripName}`"
  >
    <div class="head">
      <h3 class="title">
        {{ planned ? t('shopping.cardTitleFor', { trip: tripName }) : t('shopping.title') }}
      </h3>
      <div class="chips" role="group">
        <button
          type="button"
          class="chip"
          :aria-pressed="list === ITEM_MODE_BUY_BEFORE"
          data-testid="dash-shop-tab-before"
          @click="switchTo(ITEM_MODE_BUY_BEFORE)"
        >
          {{ t('shopping.beforeDepartureCount', { n: before.length }) }}
        </button>
        <button
          type="button"
          class="chip"
          :aria-pressed="list === ITEM_MODE_BUY_LOCAL"
          data-testid="dash-shop-tab-local"
          @click="switchTo(ITEM_MODE_BUY_LOCAL)"
        >
          {{ t('shopping.atDestinationCount', { n: local.length }) }}
        </button>
      </div>
    </div>

    <form class="add" data-testid="dash-shop-add" @submit.prevent="add">
      <input
        v-model="draft"
        :aria-label="t('shopping.addPlaceholder')"
        :placeholder="t('shopping.addPlaceholder')"
        autocomplete="off"
        data-testid="dash-shop-add-input"
      />
      <button
        type="submit"
        :disabled="draft.trim() === ''"
        :aria-label="t('shopping.addLabel')"
        data-testid="dash-shop-add-submit"
      >
        <IonIcon :icon="addOutline" aria-hidden="true" />
      </button>
    </form>

    <ul v-if="shown.length > 0" class="lines">
      <li v-for="{ line, own: isOwn } in shown" :key="line.key" data-testid="dash-shop-row">
        <span class="name">{{ line.name }}</span>
        <span v-if="line.quantity > 1" class="qty">{{ line.quantity }}×</span>
        <span v-if="!isOwn" class="tag">{{ t('shopping.fromPacking') }}</span>
        <span v-else-if="line.tag" class="tag" data-testid="dash-shop-row-tag">{{ line.tag }}</span>
        <!-- FR-30.10: when it is due, beside what it is. -->
        <DueBadge
          :day="line.dueDate ?? null"
          :today="today"
          :testid="`dash-shop-due-${line.name}`"
        />
        <!-- FR-30.9: the check-off sits at the end, where the thumb rests. -->
        <IonCheckbox
          :checked="false"
          :aria-label="t('shopping.bought', { name: line.name })"
          @ionChange="buy(line)"
        />
      </li>
    </ul>
    <InlineHint v-else-if="loaded" class="hint-flush" data-testid="dash-shop-empty">
      {{ t(list === ITEM_MODE_BUY_BEFORE ? 'shopping.emptyBefore' : 'shopping.emptyLocal') }}
    </InlineHint>

    <div v-if="lastBought" class="undo" data-testid="dash-shop-undo">
      <span>{{ t('shopping.boughtUndoable', { name: lastBought.name }) }}</span>
      <button type="button" data-testid="dash-shop-undo-button" @click="undo">
        {{ t('packing.undo') }}
      </button>
    </div>

    <RouterLink :to="tripSubPath(tripId, 'shopping')" class="more" data-testid="dash-shop-more">
      {{
        lines.length > MAX_LINES
          ? t('shopping.showAll', { n: lines.length })
          : t('shopping.openList')
      }}
      →
    </RouterLink>
  </section>
</template>

<style scoped>
.shop-card {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding: 16px;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-semibold);
}

.chips {
  display: flex;
  gap: 6px;
}

.chip {
  padding: 4px 10px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.chip[aria-pressed='true'] {
  border-color: var(--jp-action);
  color: var(--jp-action);
}

.add {
  display: flex;
  gap: 6px;
}

.add input {
  flex: 1;
  min-width: 0;
  padding: 9px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font-size: var(--jp-text-md);
}

.add button {
  width: 40px;
  border: 0;
  border-radius: var(--jp-r-sm);
  background: var(--jp-action);
  color: var(--ct-base);
  cursor: pointer;
}

.add button:disabled {
  opacity: 0.5;
  cursor: default;
}

.lines {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lines li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--ct-surface0);
}

.lines li:first-child {
  border-top: 0;
}

.name {
  flex: 1;
  min-width: 0;
}

.qty {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

/* This card is already inset by its own padding, so InlineHint's default
   left/right margin would double up — layout is the caller's. */
.hint-flush {
  margin: 0;
}

.tag {
  padding: 1px 8px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  white-space: nowrap;
}

.undo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.undo button {
  border: 0;
  background: none;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.more {
  justify-self: start;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  text-decoration: none;
}

button:focus-visible,
input:focus-visible,
.more:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}
</style>
