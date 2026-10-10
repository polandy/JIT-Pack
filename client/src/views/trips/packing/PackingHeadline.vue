<script setup lang="ts">
/**
 * One header line (G-12): what the trip stands at, and who else is here.
 * Deliberately unfiltered — see FR-25.20. Neither the trip's *other views*
 * nor its name sit here: the name is the page's own head (ADR-050).
 *
 * The `search` slot stands in for the progress card while the search is
 * open (G-12, FR-25.11k): the field opens in the sticky band, directly under
 * the switcher, instead of below the blocks the list starts with. It holds
 * its place when the head yields — what is being typed never scrolls away.
 */
import { computed, useSlots } from 'vue'

import PresenceFacepile from '@/components/global/PresenceFacepile.vue'
import ProgressFigure from '@/components/global/ProgressFigure.vue'
import TripTaskFigure from '@/views/trips/tasks/TripTaskFigure.vue'
import type { PresenceUser } from '@/composables/useSyncOrchestrator'
import { packedPercent } from '@/domain/packState'
import type { TripTask, TripTaskStatus } from '@/domain/tripTasks'
import { t } from '@/i18n'
import { formatWeight } from '@/lib/format'
import type { TripKPIs, TripParticipant } from '@/types/domain'

const props = defineProps<{
  tripId: string
  kpis: TripKPIs
  /** ADR-033: whether the trip's partition is here; nothing is measured before. */
  loaded: boolean
  /** FR-21.17: yielded to the list on the way down. */
  collapsed: boolean
  /** FR-7.7: the tasks M4's window shows, which the second figure counts. */
  tasks: readonly TripTask[]
  taskState: TripTaskStatus
  taskLine: string | null
  presenceUsers: PresenceUser[]
  participants: readonly TripParticipant[]
  isDesktop: boolean
}>()

defineEmits<{ revealTasks: [] }>()

/**
 * The ring in the header line, which is not the hero's: the line yields to
 * the list on the way down (FR-21.17) and is the one figure on the screen
 * that has to earn every pixel it keeps.
 */
const RING_SIZE_HEADER = 42

/**
 * How many faces fit before G-10's "+N" bubble. A question about the
 * header's width, so the screen that owns the header answers it.
 */
const PRESENCE_FACES_MOBILE = 2
const PRESENCE_FACES_DESKTOP = 4

/**
 * G-10's faces are named from the same directory the packing stamps use.
 * The presence event carries user ids alone, and an id is a random hex
 * string — a facepile initialled from it says who is here in a code
 * nobody can read.
 */
const presenceNames = computed<Record<string, string>>(() =>
  Object.fromEntries(props.participants.map((p) => [p.user_id, p.display_name])),
)

/**
 * What qualifies the share: the weight the trip is carrying. Under the
 * sentence rather than beside it, because a figure reads as one line and this
 * is the second (FR-21.23).
 *
 * It leaves out the open preparation: the figure beside it counts those
 * (FR-7.6), and a number stated twice on one line is a number two places
 * can disagree about.
 */
const statsDetail = computed(() =>
  props.kpis.totalWeight > 0 ? formatWeight(props.kpis.totalWeight) : null,
)

/**
 * Read at render, never cached: the slot object is not reactive, and the
 * parent's re-render is what adds or drops the field.
 */
const slots = useSlots()
const searching = (): boolean => slots.search !== undefined
const paired = (): boolean => props.taskState !== 'none' && !searching()
</script>

<template>
  <!-- Collapsed for a second reason (ADR-033): with the figure below
       waiting for the partition the line holds nothing, and an empty band
       above the note is a container asserting itself. The state that
       yields the space already exists, so it is reused rather than
       doubled. -->
  <div
    class="trip-line"
    :class="{ collapsed: !searching() && (collapsed || !loaded), paired: paired() }"
    data-testid="m4-header"
  >
    <slot v-if="searching()" name="search" />
    <!-- Where the trip stands, and who else is here. Tabular throughout:
         the weight under the share changes on the same tap as the share
         itself, and proportional digits shift both as it does. -->
    <div
      v-else
      class="trip-stats jp-card"
      :class="{ paired: paired() }"
      data-testid="m4-progress-card"
    >
      <!-- ADR-033: „0/0 packed" under an empty track is the verdict the
           note below declines to give, in the form a reader trusts most.
           It waits for the partition; 0/0 is honest once measured. -->
      <ProgressFigure
        v-if="loaded"
        class="figure jp-num"
        :percent="packedPercent(kpis)"
        :headline="t('trips.itemSummary', { packed: kpis.packedItems, total: kpis.totalItems })"
        :detail="statsDetail"
        :ring-size="RING_SIZE_HEADER"
        :paired="paired()"
        headline-testid="m4-progress"
        detail-testid="m4-stats-detail"
      />
      <!-- FR-7.4: the second check, beside the share and never inside
           it; a tap leads to the section that ticks it. -->
      <button
        v-if="loaded && paired()"
        class="task-figure-button"
        data-testid="m4-trip-todos-figure"
        :aria-label="taskLine ?? undefined"
        @click="$emit('revealTasks')"
      >
        <TripTaskFigure
          :trip-id="tripId"
          :ring-size="RING_SIZE_HEADER"
          :tasks="tasks"
          testid="m4-trip-todos-progress"
        />
      </button>
      <PresenceFacepile
        v-if="presenceUsers.length > 1"
        :users="presenceUsers"
        :names="presenceNames"
        :max="isDesktop ? PRESENCE_FACES_DESKTOP : PRESENCE_FACES_MOBILE"
      />
    </div>
  </div>
</template>

<style scoped>
.trip-line {
  display: flex;
  gap: 2px;
  /* The page's gutter, so the card inside lines up with the cards below it
     (G-14). The line itself is page, not card: sticky, it has to hide the
     rows scrolling under it, margins included. */
  padding: 8px 12px;
  /* An explicit token, not --ion-background-color: inside ion-content that
     one resolves to nothing, so the sticky line was transparent and the
     rows scrolled *through* the trip's progress figure. */
  background: var(--jp-surface-page);
  position: sticky;
  top: 0;
  /* Above the rows: ion-item-sliding is a positioned, transformed element,
     so at z-index 2 the list painted straight over the trip's figures. */
  z-index: 10;
  overflow: hidden;
  /* The figure's own height plus the line's and the card's padding: ring,
     share, what qualifies it, and the track under them (FR-21.23). */
  max-height: 118px;
  /* Clipped, never faded: a half-transparent sticky line reads as two
     lines printed on top of each other while the list slides past it. */
  transition:
    max-height 0.18s ease,
    padding 0.18s ease;
}

/* Scrolling down takes the whole line: you
   know which packing list you are on, and the rows are what the screen is
   for. Any upward scroll brings it back. The name is not in here —
   the same flag collapses the frame's page head, see setHeaderTitle. */
.trip-line.collapsed {
  max-height: 0;
  padding-block: 0;
}

/* The field takes the card's width; the line's padding is already the
   page's gutter, so the row's own would indent it twice. */
.trip-line > :slotted(.search-row) {
  flex: 1;
  min-width: 0;
  padding: 0;
}

/* A card the width of the cards below it (G-14), with one figure or two. */
.trip-stats {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: stretch;
  gap: 10px;
  /* 8 px sideways, not the card's usual 12: on a 390 px phone that is what
     keeps a pair on one line at the 10.5rem basis below. */
  padding: 10px 8px;
}

/* A pair wraps to two rows where two columns would ellipsize a sentence —
   the basis is the header ring, its gap and the longest sentence measured
   (*„118/118 gepackt"*), as on M1's hero (FR-7.4). */
.trip-stats.paired {
  flex-wrap: wrap;
  row-gap: 8px;
}

.trip-stats.paired > .figure,
.trip-stats.paired > .task-figure-button {
  flex: 1 1 10.5rem;
}

/* Two stacked figures are taller than the one the line was sized for;
   `:not(.collapsed)` so scrolling down still takes the whole line. */
.trip-line.paired:not(.collapsed) {
  max-height: 158px;
}

/* Stretched so a paired figure's two tracks share a level (FR-7.4); the
   facepile keeps to the middle of the line. */
.trip-stats > .wrap {
  align-self: center;
}

/* The ring is punched in the colour it sits on: the card's. */
.figure {
  flex: 1;
  min-width: 0;
  --ring-hole: var(--jp-surface-card);
}

/* The figure is the control; the button only makes it one. It takes the
   same share of the line as the packing figure, so the two tracks run on
   one level and one length. */
.task-figure-button {
  min-width: 0;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  text-align: start;
  cursor: pointer;
  --ring-hole: var(--jp-surface-card);
}

/* The line yields and returns instantly with motion reduced. Its travel is
   the largest movement on this screen and it happens while the list is
   moving too, which is exactly the pairing the preference is asking us not
   to make. */
@media (prefers-reduced-motion: reduce) {
  .trip-line {
    transition: none;
  }
}
</style>
