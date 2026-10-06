<script setup lang="ts">
/**
 * *Heute* on the dashboard (FR-29.7): during the trip, what is still to come
 * today on its day plan — at most three lines from the next one on, the way
 * M29 draws them, ticked and opened as there — and the way onto M29.
 *
 * It shows only on the trip's days, and on a trip with both dates, the day
 * plan's own condition. It reaches M1 through `lib/tripCards.ts`, like the
 * shopping card (FR-30.3); once the packing is finished it is a block of the
 * hero (FR-7.10).
 */
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import DashboardBlock from '@/components/global/DashboardBlock.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { t } from '@/i18n'
import { DAY_PLAN_SOURCES, DAY_PLAN_TRAVELERS } from '@/lib/dayPlanSources'
import { shortDueDay } from '@/lib/taskDueText'
import type { TripCardProps } from '@/lib/tripCards'
import { tripIdeasPath, tripSubPath } from '@/router/paths'
import { createPlannerActions } from './actions'
import DayLineRow from './DayLineRow.vue'
import { dayLines, linesAhead, stateAfterTick, tripDays, type DayLine } from './domain/dayPlan'
import { usePlannerStore } from './store'

const props = defineProps<TripCardProps>()

/** How many lines the card shows before it hands over to M29. */
const MAX_LINES = 3
/** The block's remembered fold (`lib/blockFold.ts`). */
const TODAY_FOLD_KEY = 'dayplan'
/** How often the card looks at the clock, so a passed line leaves it. */
const MINUTE_MS = 60_000

const orchestrator = useOrchestrator()
const plannerStore = usePlannerStore()
const actions = createPlannerActions(orchestrator.moduleHost, plannerStore)
const sources = inject(DAY_PLAN_SOURCES, [])
const travelersOf = inject(DAY_PLAN_TRAVELERS, () => [])
const router = useRouter()
const { nameOf } = useTripIdentity(props.tripId, orchestrator)

const today = computed(() => orchestrator.today())
const dates = computed(() => ({ start_date: props.startDate, end_date: props.endDate }))

/** Shown on the trip's days only — a day plan exists for those alone. */
const visible = computed(() => tripDays(dates.value).includes(today.value))

/** The device's wall clock as `HH:MM`, for which of today's lines have passed. */
function clockNow(): string {
  const now = new Date(orchestrator.now())
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}
const now = ref(clockNow())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = clockNow()), MINUTE_MS)
})
onUnmounted(() => clearInterval(timer))

const ahead = computed<DayLine[]>(() => {
  if (!visible.value) return []
  const lines = dayLines(today.value, {
    trip: dates.value,
    ideas: plannerStore.getIdeas(props.tripId),
    entries: plannerStore.getDayEntries(props.tripId),
    lines: sources.flatMap((source) => source.lines(props.tripId)),
    travelers: travelersOf(props.tripId),
    entryTravelers: plannerStore.getDayEntryTravelers(props.tripId),
  })
  return linesAhead(today.value, lines, now.value)
})
const shown = computed(() => ahead.value.slice(0, MAX_LINES))

/** ADR-033: nothing is said to be empty before the trip's rows are here. */
const loaded = computed(() => orchestrator.tripDataLoaded(props.tripId))
const emptyText = computed(() =>
  loaded.value && ahead.value.length === 0 ? t('dayPlan.todayEmpty') : null,
)

const dayPlanPath = computed(() => tripSubPath(props.tripId, 'dayplan'))
const heading = computed(() => t('dayPlan.todayCard', { day: shortDueDay(today.value) }))
const moreLabel = computed(() =>
  ahead.value.length > MAX_LINES
    ? t('dayPlan.todayMore', { n: ahead.value.length - MAX_LINES })
    : t('dayPlan.todayOpen'),
)

/** A tap leads where it leads on M29; the plan's own entries open on M29 itself. */
function open(line: DayLine) {
  if (line.idea) void router.push(tripIdeasPath(props.tripId, line.idea.id))
  else if (line.source) void router.push(line.source.path)
  else void router.push(dayPlanPath.value)
}

function tick(line: DayLine) {
  if (line.idea) actions.setState(line.idea, stateAfterTick(line.done === true))
  else line.source?.toggle?.()
}
</script>

<template>
  <!-- FR-7.10: a block of the hero once the packing is finished. -->
  <DashboardBlock
    v-if="visible && embedded"
    :title="heading"
    :count="ahead.length"
    :fold-key="TODAY_FOLD_KEY"
    :more-route="dayPlanPath"
    :more-label="moreLabel"
    :empty="emptyText"
    :testid="`dashboard-today-${tripName}`"
  >
    <li v-for="line in shown" :key="line.key" class="row">
      <DayLineRow :line="line" :name-of="nameOf" @open="open(line)" @tick="tick(line)" />
    </li>
  </DashboardBlock>
  <section
    v-else-if="visible"
    class="jp-card today-card"
    :data-testid="`dashboard-today-${tripName}`"
  >
    <RouterLink :to="dayPlanPath" class="head" :data-testid="`dashboard-today-${tripName}-head`">
      <h3 class="title">{{ heading }}</h3>
      <span v-if="ahead.length > 0" class="count jp-num">{{ ahead.length }}</span>
    </RouterLink>
    <ul v-if="shown.length > 0" class="rows">
      <li v-for="line in shown" :key="line.key" class="row">
        <DayLineRow :line="line" :name-of="nameOf" @open="open(line)" @tick="tick(line)" />
      </li>
    </ul>
    <p v-else-if="emptyText" class="empty" :data-testid="`dashboard-today-${tripName}-empty`">
      {{ emptyText }}
    </p>
    <RouterLink :to="dayPlanPath" class="more" :data-testid="`dashboard-today-${tripName}-more`">
      <span>{{ moreLabel }}</span>
      <span aria-hidden="true">›</span>
    </RouterLink>
  </section>
</template>

<style scoped>
.today-card {
  display: grid;
  gap: 4px;
  margin-top: 12px;
  padding: 12px 8px 10px;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px;
  color: var(--ct-text);
  text-decoration: none;
}

.title {
  margin: 0;
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-semibold);
}

.count {
  color: var(--ct-subtext0);
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  list-style: none;
}

.empty {
  margin: 4px 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.more {
  display: flex;
  gap: 4px;
  padding: 6px 8px 0;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  text-decoration: none;
}

.head:focus-visible,
.more:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}
</style>
