<script setup lang="ts">
/**
 * M6 — Shopping Views
 *
 * Focused procurement checklists (FR-3.2): *Before departure*
 * (BUY_BEFORE) and *At destination* (BUY_LOCAL), grouped by category.
 * Checking off a BUY_BEFORE item transitions it to PACK and it leaves
 * the list (FR-3.3); checking off a BUY_LOCAL item marks it packed.
 * Either way the row records the list it was bought from (FR-25.11j), so
 * the reveal below the list can find it again, say where it went, and put
 * it back. Free-text quick-add lands in the open tab's list.
 *
 * A per-person item (FR-25.1) is aggregated into **one** buy row — the
 * summed quantity and the recipients' names, derived from membership and
 * never re-entered (FR-25.6/25.10) — and checking it off settles every
 * instance, because buying is a single act. The arithmetic is
 * `domain/shoppingView.ts`; this screen renders it and fans the check-off
 * out over the row's instances.
 *
 * Standing destination-checklist entries (FR-13.3) follow once trip
 * series exist in the client.
 */
import {
  IonPage,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonList,
  IonItemGroup,
  IonItemDivider,
  IonItem,
  IonCheckbox,
} from '@ionic/vue'
import { bagHandleOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import EmptyState from '@/components/global/EmptyState.vue'
import QuickAddItem from '@/components/global/QuickAddItem.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { buildShoppingList, type ShoppingRow } from '@/domain/shoppingView'
import { t } from '@/i18n'
import { useTripStore } from '@/stores/tripStore'
import type { ShoppingMode, TripItem } from '@/types/domain'
import { isActive } from '@/domain/trips'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { setHeaderTitle } from '@/composables/useHeaderTitle'

const props = defineProps<{ tripId: string }>()

const store = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const tab = ref<ShoppingMode>('buy_before')

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

const trip = computed(() => store.getTrip(props.tripId))
const lists = computed(() => store.getShoppingItems(props.tripId))
const activeList = computed(() =>
  tab.value === 'buy_before' ? lists.value.buyBefore : lists.value.buyLocal,
)
const boughtList = computed(() =>
  tab.value === 'buy_before' ? lists.value.boughtBefore : lists.value.boughtLocal,
)

/**
 * FR-25.13d closed the gap M4 closed with FR-25.13c: what the trip already
 * carries — on either shopping tab, the packing list, or skipped — is not
 * offered again by the composer or its browse-sheet. The rule is the trip's
 * whole contents, not the open tab's: the item is on the trip either way,
 * and a second row is what the duplicate report exists to prevent.
 */
const quickAddExcludeIds = computed(() => [
  ...new Set(
    store
      .getItems(props.tripId)
      .map((item) => item.source_item_id)
      .filter((id): id is string => id !== null),
  ),
])

const travelers = computed(() => store.getTravelers(props.tripId))

const grouped = computed(() => buildShoppingList(activeList.value, travelers.value))

/**
 * What each tab's segment counts: **things to buy**, not `trip_items` rows.
 * An aggregated per-person item is one of them (FR-25.6), so a segment that
 * counted rows would promise three where the list renders one.
 */
function buyRowCount(items: TripItem[]): number {
  return buildShoppingList(items, travelers.value).reduce((n, group) => n + group.rows.length, 0)
}

/**
 * What was bought, aggregated by the same rule — otherwise a per-person item
 * that reads as one row while it is open would come back as N rows under the
 * reveal, and putting it back would be N taps for a single purchase.
 * Flattened: the reveal is a short list of what left, not a second screen.
 */
const boughtRows = computed(() =>
  buildShoppingList(boughtList.value, travelers.value).flatMap((group) => group.rows),
)

/** The recipients, named in roster order (FR-25.6). */
function recipientNames(row: ShoppingRow): string {
  return row.recipients.map((traveler) => traveler.name).join(', ')
}

/**
 * FR-3.3 + FR-25.11j + FR-25.6. A BUY_BEFORE row is bought and needs packing,
 * so it leaves this list; a BUY_LOCAL row is bought and thereby packed. The
 * tab is the list it was bought from, and travels with the change.
 *
 * Every instance is settled, not just the first: the row stands for all of
 * them, and one that names three people while settling one leaves two behind
 * where nobody is looking for them.
 */
function checkOff(row: ShoppingRow) {
  for (const instance of row.instances) {
    orchestrator.buyItem(props.tripId, instance, tab.value)
  }
}

/** FR-25.11j's undo: back onto the list the row was bought from, all of it. */
function undoBuy(row: ShoppingRow) {
  for (const instance of row.instances) {
    orchestrator.unbuyItem(props.tripId, instance, tab.value)
  }
}

/**
 * Where a revealed row went — the note FR-25.11j asks for. Read off the row
 * rather than off the tab: a BUY_BEFORE purchase is on the packing list, a
 * BUY_LOCAL one is packed, and a row whose mode changed again since says so.
 */
function wentTo(row: ShoppingRow): string {
  return row.instances[0]?.mode === 'pack' ? t('shopping.wentToPacking') : t('shopping.wentPacked')
}

const active = computed(() => isActive(trip.value))

function quickAdd(item: {
  name: string
  sourceItemId: string | null
  weightGrams: number | null
  valueCents: number | null
  categoryName: string | null
}) {
  orchestrator.quickAddItem(
    props.tripId,
    item.name,
    {
      sourceItemId: item.sourceItemId,
      weightGrams: item.weightGrams,
      valueCents: item.valueCents,
      categoryName: item.categoryName,
      mode: tab.value,
    },
    active.value,
  )
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => t('shopping.headerTitle', { trip: trip.value?.name ?? '' }))
</script>

<template>
  <IonPage>
    <IonContent data-testid="m6-page">
      <!-- ADR-011: a view switcher is page content, not header chrome. -->
      <IonSegment :value="tab" @ionChange="(e: CustomEvent) => (tab = e.detail.value)">
        <IonSegmentButton value="buy_before" data-testid="m6-tab-before">
          <IonLabel>{{
            t('shopping.beforeDeparture', { n: buyRowCount(lists.buyBefore) })
          }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton value="buy_local" data-testid="m6-tab-local">
          <IonLabel>{{ t('shopping.atDestination', { n: buyRowCount(lists.buyLocal) }) }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <QuickAddItem :is-active="active" :exclude-item-ids="quickAddExcludeIds" @add="quickAdd" />

      <IonList v-if="grouped.length > 0">
        <IonItemGroup
          v-for="group in grouped"
          :key="group.key"
          :data-testid="`m6-group-${group.name ?? 'none'}`"
        >
          <IonItemDivider>
            <IonLabel>{{ group.name ?? t('shopping.uncategorized') }}</IonLabel>
          </IonItemDivider>
          <IonItem v-for="row in group.rows" :key="row.key" data-testid="m6-row">
            <IonCheckbox
              slot="start"
              :checked="false"
              :aria-label="t('shopping.bought', { name: row.name })"
              @ionChange="checkOff(row)"
            />
            <IonLabel>
              <h3>{{ row.name }}</h3>
              <p v-if="row.quantity > 1">{{ row.quantity }}×</p>
              <!-- FR-25.6: for whom, derived from membership — never a control. -->
              <p v-if="row.recipients.length > 0" class="recipients" data-testid="m6-row-for">
                <UserAvatar
                  v-for="recipient in row.recipients"
                  :key="recipient.id"
                  :name="recipient.name"
                  :seed="recipient.id"
                  :size="18"
                />
                <span>{{ t('shopping.forWhom', { names: recipientNames(row) }) }}</span>
              </p>
            </IonLabel>
          </IonItem>
        </IonItemGroup>
      </IonList>

      <!-- Empty state (G-7) -->
      <EmptyState
        v-else
        :icon="bagHandleOutline"
        :title="t(tab === 'buy_before' ? 'shopping.emptyBefore' : 'shopping.emptyLocal')"
      />

      <!-- FR-25.11j: what was bought from this list. Same affordance as M4's
           FR-25.2 done bar — the count is in the label, and one tap reveals. -->
      <button
        v-if="boughtRows.length > 0"
        class="reveal-bar"
        :class="{ on: showBought }"
        data-testid="m6-bought-bar"
        @click="showBought = !showBought"
      >
        {{
          showBought
            ? t('shopping.hideBought', { n: boughtRows.length })
            : t('shopping.showBought', { n: boughtRows.length })
        }}
      </button>

      <IonList v-if="showBought && boughtRows.length > 0" data-testid="m6-bought-list">
        <IonItem v-for="row in boughtRows" :key="row.key" data-testid="m6-bought-row">
          <IonCheckbox
            slot="start"
            :checked="true"
            :aria-label="t('shopping.undoBought', { name: row.name })"
            @ionChange="undoBuy(row)"
          />
          <IonLabel>
            <h3>{{ row.name }}</h3>
            <p data-testid="m6-bought-note">{{ wentTo(row) }}</p>
          </IonLabel>
        </IonItem>
      </IonList>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* Same shape as M4's FR-25.2 reveal bar: an outline that is dashed while it
   hides something and solid while it shows it. */
.reveal-bar {
  display: block;
  width: calc(100% - 24px);
  margin: 10px 12px;
  padding: 10px;
  border: 1px dashed var(--ct-surface2);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.reveal-bar.on {
  border-style: solid;
  color: var(--ct-text);
}

.recipients {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
