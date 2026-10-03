<script setup lang="ts">
/**
 * An excursion's way there and back, on its own screen (FR-29.18): two slots,
 * each a connection as the day plan has it, the time the two leave on the
 * spot, and any other connection of the excursion beneath. Adding and changing
 * use the day plan's sheet; the day plan shows the result on its day. M27
 * renders this through `lib/excursionConnections.ts`, so the packing side
 * never imports it.
 */
import { IonIcon } from '@ionic/vue'
import { addOutline, chevronForward } from 'ionicons/icons'
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
import DayEntrySheet from './DayEntrySheet.vue'
import { budgetWords, journeyDetail } from './journeyText'
import { usePageLinks } from './usePageLinks'
import { usePlannerStore } from './store'

const props = defineProps<ExcursionConnectionsProps>()

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

const budget = computed(() =>
  journeyBudget({
    out: journey.value.out,
    back: journey.value.back,
    routeMinutes: props.routeMinutes,
  }),
)
const budgetText = computed(() => (budget.value ? budgetWords(budget.value) : null))

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
  <section
    class="connections"
    :aria-label="t('excursionConnections.title')"
    data-testid="m27-connections"
  >
    <h3 class="jp-eyebrow head">{{ t('excursionConnections.title') }}</h3>
    <div class="jp-card card">
      <p v-if="!day" class="no-day" data-testid="m27-journey-no-day">{{ t('journey.noDay') }}</p>
      <template v-else>
        <button
          v-for="slot in slots"
          :key="slot.role"
          type="button"
          class="row slot"
          :data-testid="`m27-journey-${slot.role}`"
          @click="openSlot(slot)"
        >
          <span class="label jp-eyebrow">{{ slot.label }}</span>
          <span v-if="slot.entry" class="body">
            <span class="times jp-num">
              {{ journeyTimes(slot.entry).dep }}
              <template v-if="journeyTimes(slot.entry).arr">
                → {{ journeyTimes(slot.entry).arr }}
              </template>
            </span>
            <span class="detail">{{ journeyDetail(slot.entry) }}</span>
          </span>
          <span v-else class="body add">
            <IonIcon class="plus" :icon="addOutline" aria-hidden="true" />
            {{ slot.add }}
          </span>
          <IonIcon v-if="slot.entry" class="chevron" :icon="chevronForward" aria-hidden="true" />
        </button>
      </template>
      <button
        v-for="entry in journey.others"
        :key="entry.id"
        type="button"
        class="row"
        :data-testid="`m27-connection-${entry.id}`"
        @click="openOther(entry)"
      >
        <span class="label jp-num">{{ journeyTimes(entry).dep }}</span>
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
    </div>

    <DayEntrySheet
      :open="editing !== null"
      :entry="editing?.entry ?? null"
      :day="editing?.day ?? day"
      :day-text="editing?.day ? shortDueDay(editing.day) : ''"
      :pool="[]"
      :page-links="pageLinks"
      :excursion-title="title"
      :heading="editing?.heading"
      connection-only
      @close="editing = null"
      @save-connection="onSave"
      @remove="onRemove"
    />
  </section>
</template>

<style scoped>
.connections {
  margin: 0 12px 10px;
}

.head {
  margin: 0 4px 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 8px 12px;
  border: none;
  border-top: 1px solid var(--jp-surface-border);
  background: none;
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-md);
  text-align: start;
  cursor: pointer;
}

.row:first-child {
  border-top: none;
}

.row:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}

.label {
  flex: none;
  width: 56px;
  color: var(--ct-subtext0);
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.times {
  font-weight: var(--jp-weight-semibold);
}

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

.add {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  color: var(--jp-action);
  font-weight: var(--jp-weight-semibold);
}

.plus {
  flex: none;
  font-size: var(--jp-icon-sm);
}

.chevron {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-xs);
}

.no-day {
  margin: 0;
  padding: 12px;
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
