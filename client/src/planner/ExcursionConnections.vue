<script setup lang="ts">
/**
 * *Der Tag* on an excursion's own screen (FR-29.18): the way there, the route
 * M27 hands in as the `route` slot, and the way back, in that order as a
 * timeline, with the time the two leave on the spot at its foot and any other
 * connection of the excursion beneath. Each way is a connection as the day
 * plan has it, added and changed through the day plan's sheet. Folded, the
 * head says the day in one line. M27 renders this through
 * `lib/excursionConnections.ts`, so the packing side never imports it.
 */
import { IonIcon } from '@ionic/vue'
import {
  addOutline,
  chevronDown,
  chevronForward,
  compassOutline,
  trainOutline,
  walkOutline,
} from 'ionicons/icons'
import { computed, onMounted, ref } from 'vue'

import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { t } from '@/i18n'
import { confirmDestructive } from '@/lib/confirm'
import type { ExcursionConnectionsProps } from '@/lib/excursionConnections'
import { shortDueDay } from '@/lib/taskDueText'
import {
  EXCURSION_ROLE_BACK,
  EXCURSION_ROLE_OUT,
  type DayEntry,
  type ExcursionRole,
} from '@/types/domain'
import { createPlannerActions, type ConnectionFields } from './actions'
import { excursionJourney, journeyBudget, journeyTimes } from './domain/journey'
import { searchSeed } from './domain/timetable'
import DayEntrySheet from './DayEntrySheet.vue'
import { budgetWords, daySummary, wayWords } from './journeyText'
import { usePageLinks } from './usePageLinks'
import { usePlannerStore } from './store'

const props = defineProps<ExcursionConnectionsProps>()
const emit = defineEmits<{ toggle: [] }>()

const orchestrator = useOrchestrator()
const plannerStore = usePlannerStore()
const actions = createPlannerActions(orchestrator.moduleHost, plannerStore)
const pageLinks = usePageLinks(props.tripId, orchestrator)
const { myUserId, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)

onMounted(loadIdentity)

const journey = computed(() =>
  excursionJourney(plannerStore.getDayEntries(props.tripId), props.excursionId),
)

interface Slot {
  role: ExcursionRole
  label: string
  heading: string
  add: string
  /** The day a way written by hand lands on. */
  day: string | null
  entry: DayEntry | null
}

const slots = computed<Slot[]>(() => [
  {
    role: EXCURSION_ROLE_OUT,
    label: t('journey.out'),
    heading: t('journey.outTitle'),
    add: t('journey.addOut'),
    day: props.day,
    entry: journey.value.out,
  },
  {
    role: EXCURSION_ROLE_BACK,
    label: t('journey.back'),
    heading: t('journey.backTitle'),
    add: t('journey.addBack'),
    day: props.lastDay ?? props.day,
    entry: journey.value.back,
  },
])

/** The timetable search's start for the slot being written (FR-29.18). */
const seed = computed(() =>
  searchSeed({
    role: editing.value?.role ?? null,
    out: journey.value.out,
    routeMinutes: props.routeMinutes,
  }),
)
/** The way there ends at the stop nearest the route's start. */
const near = computed(() => {
  const start = props.routeStart
  return editing.value?.role === EXCURSION_ROLE_OUT && start
    ? { lat: start[0], lon: start[1] }
    : null
})

const budget = computed(() =>
  journeyBudget({
    out: journey.value.out,
    back: journey.value.back,
    routeMinutes: props.routeMinutes,
  }),
)
const budgetText = computed(() => (budget.value ? budgetWords(budget.value) : null))

/** Nothing written and no route: the card stays open, since folded it would hide how to start. */
const empty = computed(
  () =>
    !journey.value.out &&
    !journey.value.back &&
    journey.value.others.length === 0 &&
    !props.routeSummary,
)
const expanded = computed(() => props.open || empty.value)
// With a way beside it the route says its distance alone, so the line fits a phone.
const folded = computed(() =>
  daySummary(
    journey.value,
    journey.value.out || journey.value.back ? props.routeDistance : props.routeSummary,
    budget.value,
  ),
)

/** The bar's four stretches — there, the route, what is left, back — as shares of the whole. */
const bar = computed(() => {
  const b = budget.value
  if (!b || b.kind !== 'onSite' || b.routeMinutes === null || b.bar.total <= 0) return null
  const share = (from: number, to: number) => ({
    left: `${(Math.max(0, from) / b.bar.total) * 100}%`,
    width: `${(Math.max(0, Math.min(to, b.bar.total) - Math.max(0, from)) / b.bar.total) * 100}%`,
  })
  return [
    { kind: 'travel', ...share(0, b.bar.arrive) },
    { kind: 'route', ...share(b.bar.arrive, Math.min(b.bar.routeEnd, b.bar.leave)) },
    { kind: 'slack', ...share(b.bar.routeEnd, b.bar.leave) },
    { kind: 'travel', ...share(b.bar.leave, b.bar.total) },
  ]
})

/** What the sheet writes: a connection being changed, or the slot a new one fills. */
interface Editing {
  entry: DayEntry | null
  role: ExcursionRole | null
  day: string | null
  heading: string | null
}
const editing = ref<Editing | null>(null)

function openSlot(slot: Slot) {
  editing.value = { entry: slot.entry, role: slot.role, day: slot.day, heading: slot.heading }
}

function openOther(entry: DayEntry) {
  editing.value = { entry, role: null, day: entry.on_date, heading: null }
}

function onSave(fields: ConnectionFields) {
  const current = editing.value
  editing.value = null
  if (!current) return
  if (current.entry) actions.updateConnection(current.entry, fields)
  else
    actions.addConnection(
      props.tripId,
      { ...fields, excursionId: props.excursionId, role: current.role },
      myUserId.value,
    )
}

async function onRemove() {
  const entry = editing.value?.entry
  if (!entry) return
  const confirmed = await confirmDestructive({
    header: t('dayPlan.removeConfirmTitle', { title: entry.title }),
    message: t('dayPlan.removeConfirmBody'),
    confirmLabel: t('dayPlan.remove'),
    testid: 'day-entry-remove-confirm',
  })
  if (!confirmed) return
  editing.value = null
  actions.removeDayEntry(entry)
}
</script>

<template>
  <section class="day jp-card" :aria-label="t('journey.title')" data-testid="m27-connections">
    <button
      type="button"
      class="head"
      :aria-expanded="expanded ? 'true' : 'false'"
      :disabled="empty"
      data-testid="m27-day-toggle"
      @click="emit('toggle')"
    >
      <IonIcon class="glyph" :icon="compassOutline" aria-hidden="true" />
      <span class="label">{{ t('journey.title') }}</span>
      <span v-if="!expanded && folded" class="folded jp-num" data-testid="m27-day-folded">
        {{ folded }}
      </span>
      <IonIcon v-if="!empty" class="caret" :icon="chevronDown" aria-hidden="true" />
    </button>

    <template v-if="expanded">
      <ol class="timeline">
        <template v-for="(slot, index) in slots" :key="slot.role">
          <li v-if="index === 1 && routeSummary" class="step" data-testid="m27-day-route">
            <span class="dot route" aria-hidden="true"><IonIcon :icon="walkOutline" /></span>
            <div class="body"><slot name="route" /></div>
          </li>
          <li v-if="day" class="step">
            <span class="dot" :class="{ open: !slot.entry }" aria-hidden="true">
              <IonIcon :icon="slot.entry ? trainOutline : addOutline" />
            </span>
            <button
              type="button"
              class="way"
              :class="{ add: !slot.entry }"
              :data-testid="`m27-journey-${slot.role}`"
              @click="openSlot(slot)"
            >
              <template v-if="slot.entry">
                <span class="body">
                  <span class="title jp-num">{{ wayWords(slot.entry).title }}</span>
                  <span class="detail">
                    {{ [slot.label, wayWords(slot.entry).detail].filter(Boolean).join(' · ') }}
                  </span>
                </span>
                <IonIcon class="chevron" :icon="chevronForward" aria-hidden="true" />
              </template>
              <span v-else class="body">{{ slot.add }}</span>
            </button>
          </li>
          <li v-else-if="index === 0" class="step">
            <span class="dot open" aria-hidden="true"><IonIcon :icon="trainOutline" /></span>
            <p class="no-day" data-testid="m27-journey-no-day">{{ t('journey.noDay') }}</p>
          </li>
        </template>
      </ol>
      <button
        v-for="entry in journey.others"
        :key="entry.id"
        type="button"
        class="other"
        :data-testid="`m27-connection-${entry.id}`"
        @click="openOther(entry)"
      >
        <span class="time jp-num">{{ journeyTimes(entry).dep }}</span>
        <span class="body">
          <span class="name">{{ entry.title }}</span>
          <span class="detail">{{ shortDueDay(entry.on_date) }}</span>
        </span>
        <IonIcon class="chevron" :icon="chevronForward" aria-hidden="true" />
      </button>
      <div v-if="day && budgetText" class="budget" data-testid="m27-journey-budget">
        <div v-if="bar" class="bar" aria-hidden="true">
          <i
            v-for="(stretch, i) in bar"
            :key="i"
            :class="stretch.kind"
            :style="{ left: stretch.left, width: stretch.width }"
          />
        </div>
        <p class="budget-text" :data-tone="budgetText.tone">{{ budgetText.text }}</p>
      </div>
    </template>

    <DayEntrySheet
      :open="editing !== null"
      :entry="editing?.entry ?? null"
      :day="editing?.day ?? day"
      :day-text="editing?.day ? shortDueDay(editing.day) : ''"
      :pool="[]"
      :page-links="pageLinks"
      :excursion-title="title"
      :search-seed="seed"
      :search-near="near"
      :heading="editing?.heading"
      connection-only
      @close="editing = null"
      @save-connection="onSave"
      @remove="onRemove"
    />
  </section>
</template>

<style scoped>
.day {
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 6px 12px;
  border: none;
  background: none;
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-sm);
  text-align: start;
  cursor: pointer;
}

.head:disabled {
  cursor: default;
  opacity: 1;
}

.head:focus-visible,
.way:focus-visible,
.other:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}

.glyph {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-sm);
}

.label {
  flex: none;
  font-weight: var(--jp-weight-semibold);
}

.folded {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ct-subtext0);
  text-align: end;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caret {
  flex: none;
  margin-inline-start: auto;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-xs);
  transition: transform 0.2s;
}

.head[aria-expanded='false'] .caret {
  transform: rotate(-90deg);
}

.timeline {
  margin: 0;
  padding: 4px 12px 4px;
  border-top: 1px solid var(--jp-surface-border);
  list-style: none;
}

.step {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 6px 0;
}

/* The rail joining one step to the next, behind the dots. */
.step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 38px;
  bottom: -6px;
  left: 13px;
  width: 2px;
  background: var(--jp-surface-border);
}

.dot {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-top: 4px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ct-glacier) 22%, transparent);
  color: var(--ct-glacier);
  font-size: var(--jp-icon-xs);
}

.dot.route {
  background: color-mix(in srgb, var(--ct-larch) 22%, transparent);
  color: var(--ct-larch);
}

.dot.open {
  border: 1px dashed var(--jp-surface-border);
  background: none;
  color: var(--ct-subtext0);
}

.step > .body {
  flex: 1;
  min-width: 0;
}

.way,
.other {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 44px;
  padding: 0;
  border: none;
  background: none;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.way .body,
.other .body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.way.add {
  color: var(--jp-action);
  font-weight: var(--jp-weight-semibold);
  font-size: var(--jp-text-md);
}

.title {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}

.title,
.name,
.detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.chevron {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-xs);
}

.no-day {
  flex: 1;
  margin: 0;
  padding-top: 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.other {
  width: 100%;
  padding: 8px 12px;
  border-top: 1px solid var(--jp-surface-border);
  gap: 12px;
}

.time {
  flex: none;
  width: 28px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.budget {
  padding: 10px 12px 12px;
  border-top: 1px solid var(--jp-surface-border);
}

.bar {
  position: relative;
  height: 4px;
  margin-bottom: 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-border);
}

.bar i {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: var(--jp-r-pill);
}

.bar .travel {
  background: var(--ct-glacier);
}

.bar .route {
  background: var(--jp-done);
}

.bar .slack {
  background: transparent;
}

.budget-text {
  margin: 0;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.budget-text[data-tone='ok'] {
  color: var(--jp-done);
}

.budget-text[data-tone='tight'] {
  color: var(--ct-straw);
}

.budget-text[data-tone='short'] {
  color: var(--ct-ember);
}
</style>
