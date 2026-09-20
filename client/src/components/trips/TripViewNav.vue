<script setup lang="ts">
/**
 * The trip's views a trip is worked in, as words under the page's name
 * (FR-21.21, ADR-051 and its amendment 1).
 *
 * ADR-050 sent shopping, luggage and analytics into the bar's ⋮ so the bar
 * could stop growing glyphs, and wrote the cost down: §3.25's "one tap each"
 * spent, five destinations behind one glyph. ADR-051 was the other half of
 * that decision — the views came back as a row of words that says where you
 * are as well as where you can go, on all four screens, so the step from the
 * shopping list to the luggage no longer goes back through the packing list.
 *
 * Amendment 1 keeps that shape and narrows what stands in it: the packing
 * list and the shopping list, plus whichever view is being looked at. The
 * luggage and the analytics are read once a trip, and a row of four made
 * that indistinguishable from the two that are worked in daily; they are
 * entries in the bar's ⋮ again, which `AppHeader` fills from the same table.
 *
 * The frame renders it, once, from `meta.tripView` — the same shape as the
 * content column it sits in (G-9): a screen that had to remember to offer
 * its siblings is a screen that will forget.
 */
import { IonIcon, useIonRouter } from '@ionic/vue'
import { computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { t } from '@/i18n'
import {
  TRIP_VIEW_COUNTS,
  tripViewEntry,
  tripViewPills,
  type TripViewEntry,
  type TripViewId,
} from '@/lib/tripViews'

const props = defineProps<{
  tripId: string
  /** Which of the four this screen is; it renders as the current one. */
  current: TripViewId
}>()

const router = useRouter()
const ionRouter = useIonRouter()
// FR-30.3: the count is the shopping module's, provided by the composition
// root — the frame does not import the module behind the pill.
const counts = inject(TRIP_VIEW_COUNTS, {})

const views = computed(() =>
  tripViewPills(props.current).map((id) => tripViewEntry(id, props.tripId, counts)),
)

/**
 * The packing list is the parent of the other three (ADR-011's declared
 * back target), so arriving at it from a sibling is a return and not a push:
 * the same `navigate(..., 'back', 'replace')` the bar's chevron makes, which
 * is what keeps one live page per route rather than two (ADR-046).
 */
function go(view: TripViewEntry) {
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
      :data-testid="view.testid"
      :aria-current="view.id === props.current ? 'page' : undefined"
      @click="go(view)"
    >
      <IonIcon :icon="view.icon" aria-hidden="true" />
      <span>{{ view.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
/* The row scrolls rather than wraps: a second line would push the list down
   by as much as the head above it. It stays a scroller although the row is
   two or three pills since amendment 1 — a long shopping count and a wide
   locale are what a fixed width would clip. */
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
   everywhere else (G-11), so the row reads as one control and not as a set
   of buttons of which one is broken. */
.view.current {
  border-color: var(--jp-action);
  color: var(--jp-action);
  cursor: default;
}

/* The breakpoint outlived the four-pill row it was measured for (ADR-051
   amendment 1). Two pills leave room for their glyphs at 390 px, but the
   widest row the amendment can produce does not: the luggage or the
   analytics standing as the current view makes three, and in German that is
   *Packliste · Einkaufen (3) · Auswertung* — 286 px of words in 358, which
   three glyphs and their gaps overrun. A breakpoint that held at two widths
   and failed at a third would be worse than the one line it saves. */
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
