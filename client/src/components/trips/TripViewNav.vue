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
 * Amendment 1 keeps that shape and narrows what stands in it: the views a
 * trip is worked in, plus whichever view is being looked at. The luggage and
 * the analytics are read once a trip, and a row of four made that
 * indistinguishable from the ones worked in daily; they are entries in the
 * bar's ⋮ again, which `AppHeader` fills from the same table.
 *
 * Amendment 3 (owner, 2026-09-25) keeps the word only where you stand: every
 * other view is its glyph, with its number as a badge, because four words and
 * their counts no longer fit a 390 px row. A glyph without a word names
 * itself three ways — `aria-label`, a `title` for a hovering pointer, and a
 * bubble on a held press for a finger, which is the one a phone has.
 *
 * The frame renders it, once, from `meta.tripView` — the same shape as the
 * content column it sits in (G-9): a screen that had to remember to offer
 * its siblings is a screen that will forget.
 */
import { IonIcon, useIonRouter } from '@ionic/vue'
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLongPress } from '@/composables/useLongPress'
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
  // The release that ends a hold still fires a click; the hold was the
  // answer to "what is this", so it must not also be a "take me there".
  if (swallowClick) {
    swallowClick = false
    return
  }
  if (view.id === props.current) return
  if (view.id === 'packing') ionRouter.navigate(view.path, 'back', 'replace')
  else router.push(view.path)
}

/** Where the bubble points, in viewport coordinates — it is teleported out of the scrolling row. */
interface Bubble {
  label: string
  x: number
  y: number
}

/** How long the name stays once the finger has lifted — long enough to read two words. */
const BUBBLE_LINGER_MS = 1200
/** Half the widest name (*Auswertung*) plus a gutter: the nearest the bubble's centre comes to an edge. */
const BUBBLE_EDGE_PX = 56

const bubble = ref<Bubble | null>(null)
let swallowClick = false
let lingerTimer: ReturnType<typeof setTimeout> | null = null

function hideBubble() {
  if (lingerTimer !== null) clearTimeout(lingerTimer)
  lingerTimer = null
  bubble.value = null
}

const press = useLongPress<{ view: TripViewEntry; el: HTMLElement }>(({ view, el }) => {
  const box = el.getBoundingClientRect()
  // Centred under the glyph, but never so near an edge that the word is cut.
  const x = Math.min(
    Math.max(box.left + box.width / 2, BUBBLE_EDGE_PX),
    innerWidth - BUBBLE_EDGE_PX,
  )
  bubble.value = { label: view.label, x, y: box.bottom }
  swallowClick = true
})

function onDown(view: TripViewEntry, event: PointerEvent) {
  hideBubble()
  swallowClick = false
  // The current pill already says its word; holding it has nothing to add.
  if (view.id === props.current) return
  press.down({ view, el: event.currentTarget as HTMLElement }, event.clientX, event.clientY)
}

function onRelease() {
  press.cancel()
  if (bubble.value && lingerTimer === null) lingerTimer = setTimeout(hideBubble, BUBBLE_LINGER_MS)
}

// A bubble belongs to the screen it was asked on.
watch(() => props.current, hideBubble)
onBeforeUnmount(hideBubble)
</script>

<template>
  <nav
    class="trip-views"
    :aria-label="t('packing.tripViews')"
    data-testid="trip-views"
    @scroll.passive="hideBubble"
  >
    <button
      v-for="view in views"
      :key="view.id"
      class="view"
      :class="{ current: view.id === props.current }"
      :data-testid="view.testid"
      :aria-current="view.id === props.current ? 'page' : undefined"
      :aria-label="view.label"
      :title="view.id === props.current ? undefined : view.label"
      @pointerdown="onDown(view, $event)"
      @pointermove="press.move($event.clientX, $event.clientY)"
      @pointerup="onRelease"
      @pointercancel="onRelease"
      @pointerleave="onRelease"
      @contextmenu.prevent
      @click="go(view)"
    >
      <IonIcon :icon="view.icon" aria-hidden="true" />
      <span v-if="view.id === props.current" aria-hidden="true">{{ view.label }}</span>
      <span
        v-else-if="view.count > 0"
        class="count jp-num"
        aria-hidden="true"
        :data-testid="`${view.testid}-count`"
        >{{ view.count }}</span
      >
    </button>
  </nav>
  <Teleport to="body">
    <div
      v-if="bubble"
      class="trip-view-bubble"
      role="tooltip"
      data-testid="trip-view-bubble"
      :style="{ left: `${bubble.x}px`, top: `${bubble.y}px` }"
    >
      {{ bubble.label }}
    </div>
  </Teleport>
</template>

<style scoped>
/* The row scrolls rather than wraps: a second line would push the list down
   by as much as the head above it. Since amendment 3 four glyphs and one
   word fit the narrowest phone with room to spare, but the current view's
   word carries a count, and a count has no upper bound. The top padding is
   the badges' — a scroller clips whatever overhangs it. */
.trip-views {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  padding-top: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.view {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  padding: 5px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
  white-space: nowrap;
  /* A held press is the bubble's; the browser's own callout and text
     selection would answer it first. */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

/* A glyph standing alone is its own tap target (G-13's md step); beside a
   word it is the smaller step it has always been. */
.view ion-icon {
  font-size: var(--jp-icon-md);
}

/* Where you are, in the action role — the same blue a chosen thing wears
   everywhere else (G-11), so the row reads as one control and not as a set
   of buttons of which one is broken. It keeps its word: a row of glyphs
   that marked nothing in words would have stopped saying where you are. */
.view.current {
  padding: 5px 10px;
  border-color: var(--jp-action);
  color: var(--jp-action);
  cursor: default;
}

.view.current ion-icon {
  font-size: var(--jp-icon-sm);
}

.count {
  position: absolute;
  top: -6px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface2);
  color: var(--ct-text);
  font-size: var(--jp-text-3xs);
  font-weight: var(--jp-weight-bold);
  line-height: 17px;
  text-align: center;
}

.trip-view-bubble {
  position: fixed;
  z-index: 1000;
  transform: translate(-50%, 8px);
  padding: 5px 10px;
  border-radius: var(--jp-r-sm);
  background: var(--ct-text);
  color: var(--ct-base);
  box-shadow: var(--jp-shadow);
  font-size: var(--jp-text-sm);
  white-space: nowrap;
  pointer-events: none;
}
</style>
