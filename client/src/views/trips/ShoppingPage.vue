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
  IonIcon,
} from '@ionic/vue'
import { bagHandleOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import QuickAddItem from '@/components/global/QuickAddItem.vue'
import { t } from '@/i18n'
import { useTripStore } from '@/stores/tripStore'
import type { ShoppingMode, TripItem } from '@/types/domain'
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

const grouped = computed(() => {
  const groups = new Map<string, TripItem[]>()
  for (const item of activeList.value) {
    const key = item.category_name ?? t('shopping.uncategorized')
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()]
})

/**
 * FR-3.3 + FR-25.11j. A BUY_BEFORE row is bought and needs packing, so it
 * leaves this list; a BUY_LOCAL row is bought and thereby packed. The tab is
 * the list it was bought from, and travels with the change.
 */
function checkOff(item: TripItem) {
  orchestrator.buyItem(props.tripId, item, tab.value)
}

/** FR-25.11j's undo: back onto the list the row was bought from. */
function undoBuy(item: TripItem) {
  orchestrator.unbuyItem(props.tripId, item, tab.value)
}

/**
 * Where a revealed row went — the note FR-25.11j asks for. Read off the row
 * rather than off the tab: a BUY_BEFORE purchase is on the packing list, a
 * BUY_LOCAL one is packed, and a row whose mode changed again since says so.
 */
function wentTo(item: TripItem): string {
  return item.mode === 'pack' ? t('shopping.wentToPacking') : t('shopping.wentPacked')
}

const isActive = computed(() => trip.value?.status === 'active')

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
    isActive.value,
  )
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => t('shopping.headerTitle', { trip: trip.value?.name ?? '' }))
</script>

<template>
  <IonPage>
    <IonContent>
      <!-- ADR-011: a view switcher is page content, not header chrome. -->
      <IonSegment :value="tab" @ionChange="(e: CustomEvent) => (tab = e.detail.value)">
        <IonSegmentButton value="buy_before">
          <IonLabel>{{ t('shopping.beforeDeparture', { n: lists.buyBefore.length }) }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton value="buy_local">
          <IonLabel>{{ t('shopping.atDestination', { n: lists.buyLocal.length }) }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <QuickAddItem :is-active="isActive" :exclude-item-ids="quickAddExcludeIds" @add="quickAdd" />

      <IonList v-if="grouped.length > 0">
        <IonItemGroup v-for="[category, items] in grouped" :key="category">
          <IonItemDivider>
            <IonLabel>{{ category }}</IonLabel>
          </IonItemDivider>
          <IonItem v-for="item in items" :key="item.id" data-testid="m6-row">
            <IonCheckbox
              slot="start"
              :checked="false"
              :aria-label="t('shopping.bought', { name: item.name })"
              @ionChange="checkOff(item)"
            />
            <IonLabel>
              <h3>{{ item.name }}</h3>
              <p v-if="item.quantity > 1">{{ item.quantity }}×</p>
            </IonLabel>
          </IonItem>
        </IonItemGroup>
      </IonList>

      <!-- Empty state (G-7) -->
      <div v-else class="empty-state">
        <IonIcon :icon="bagHandleOutline" class="empty-icon" />
        <p>{{ t(tab === 'buy_before' ? 'shopping.emptyBefore' : 'shopping.emptyLocal') }}</p>
      </div>

      <!-- FR-25.11j: what was bought from this list. Same affordance as M4's
           FR-25.2 done bar — the count is in the label, and one tap reveals. -->
      <button
        v-if="boughtList.length > 0"
        class="reveal-bar"
        :class="{ on: showBought }"
        data-testid="m6-bought-bar"
        @click="showBought = !showBought"
      >
        {{
          showBought
            ? t('shopping.hideBought', { n: boughtList.length })
            : t('shopping.showBought', { n: boughtList.length })
        }}
      </button>

      <IonList v-if="showBought && boughtList.length > 0" data-testid="m6-bought-list">
        <IonItem v-for="item in boughtList" :key="item.id" data-testid="m6-bought-row">
          <IonCheckbox
            slot="start"
            :checked="true"
            :aria-label="t('shopping.undoBought', { name: item.name })"
            @ionChange="undoBuy(item)"
          />
          <IonLabel>
            <h3>{{ item.name }}</h3>
            <p data-testid="m6-bought-note">{{ wentTo(item) }}</p>
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--ion-color-medium);
  margin-top: 48px;
}

.empty-icon {
  font-size: var(--jp-icon-2xl);
  margin-bottom: 16px;
}
</style>
