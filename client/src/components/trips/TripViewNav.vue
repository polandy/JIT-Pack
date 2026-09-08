<script setup lang="ts">
/**
 * The trip's four views, as words under the page's name (FR-21.21, ADR-051).
 *
 * ADR-050 sent shopping, luggage and analytics into the bar's ⋮ so the bar
 * could stop growing glyphs, and wrote the cost down: §3.25's "one tap each"
 * spent, five destinations behind one glyph. This is the other half of that
 * decision — the views come back as a row of words that says where you are
 * as well as where you can go, and it renders on all four of them, so the
 * step from the shopping list to the luggage no longer goes back through the
 * packing list first.
 *
 * The frame renders it, once, from `meta.tripView` — the same shape as the
 * content column it sits in (G-9): a screen that had to remember to offer
 * its siblings is a screen that will forget.
 */
import { IonIcon, useIonRouter } from '@ionic/vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { briefcaseOutline, cartOutline, listOutline, statsChartOutline } from 'ionicons/icons'
import { t } from '@/i18n'
import { tripPath, tripSubPath } from '@/router/paths'
import { buyRowCount } from '@/domain/shoppingView'
import { useTripStore } from '@/stores/tripStore'
import type { TripViewId } from '@/lib/tripViews'

const props = defineProps<{
  tripId: string
  /** Which of the four this screen is; it renders as the current one. */
  current: TripViewId
}>()

const router = useRouter()
const ionRouter = useIonRouter()
const tripStore = useTripStore()

/**
 * The count is what makes the shopping entry worth a tap; at zero the word is
 * offered without it, because the destination exists either way (ADR-050 put
 * the number in the word when the action sheet could render no badge, and a
 * pill keeps it there).
 *
 * **Things to buy, not rows** — the same arithmetic M6's own segments use
 * (FR-25.6). The menu entry counted rows and nothing noticed, because the two
 * numbers were never on one screen; the pill sits above the segments that
 * state them, and said 3 over a list saying 1 + 1 the first time it rendered.
 */
const openShopping = computed(() => {
  const lists = tripStore.getShoppingItems(props.tripId)
  const travelers = tripStore.getTravelers(props.tripId)
  return buyRowCount(lists.buyBefore, travelers) + buyRowCount(lists.buyLocal, travelers)
})

const views = computed(() => [
  {
    id: 'packing' as const,
    icon: listOutline,
    label: t('packing.title'),
    path: tripPath(props.tripId),
  },
  {
    id: 'shopping' as const,
    icon: cartOutline,
    label:
      openShopping.value > 0
        ? t('packing.shoppingCount', { n: openShopping.value })
        : t('packing.shopping'),
    path: tripSubPath(props.tripId, 'shopping'),
  },
  {
    id: 'luggage' as const,
    icon: briefcaseOutline,
    label: t('packing.luggage'),
    path: tripSubPath(props.tripId, 'containers'),
  },
  {
    id: 'analytics' as const,
    icon: statsChartOutline,
    label: t('packing.analytics'),
    path: tripSubPath(props.tripId, 'analytics'),
  },
])

/**
 * The packing list is the parent of the other three (ADR-011's declared
 * back target), so arriving at it from a sibling is a return and not a push:
 * the same `navigate(..., 'back', 'replace')` the bar's chevron makes, which
 * is what keeps one live page per route rather than two (ADR-046).
 */
function go(view: { id: TripViewId; path: string }) {
  if (view.id === props.current) return
  if (view.id === 'packing') ionRouter.navigate(view.path, 'back', 'replace')
  else router.push(view.path)
}
</script>

<template>
  <nav class="trip-views" :aria-label="t('packing.tripViews')" data-testid="trip-views">
    <button
      v-for="view in views"
      :key="view.id"
      class="view"
      :class="{ current: view.id === props.current }"
      :data-testid="`trip-view-${view.id}`"
      :aria-current="view.id === props.current ? 'page' : undefined"
      @click="go(view)"
    >
      <IonIcon :icon="view.icon" aria-hidden="true" />
      <span>{{ view.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
/* Four pills on one line at 390 px, and the row scrolls rather than wraps:
   a second line would push the list down by as much as the head above it. */
.trip-views {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  overflow-x: auto;
  scrollbar-width: none;
}

.view {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  padding: 5px 10px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
  white-space: nowrap;
}

/* Where you are, in the action role — the same blue a chosen thing wears
   everywhere else (G-11), so the row reads as one control and not as four
   buttons of which one is broken. */
.view.current {
  border-color: var(--jp-action);
  color: var(--jp-action);
  cursor: default;
}

/* Four words fill a 390 px row to within a few pixels (measured: 352 of
   358). The glyphs would take 90 more and push the fourth off the edge, so
   below the phone breakpoint the pills are words alone — which is what they
   are read as anyway; the icon is the reader's shortcut once there is room
   for it. */
.view ion-icon {
  display: none;
  font-size: var(--jp-icon-sm);
}

@media (min-width: 480px) {
  .view ion-icon {
    display: inline-flex;
  }
}
</style>
