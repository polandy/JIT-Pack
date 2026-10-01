<script setup lang="ts">
/**
 * M29 — a trip's day plan (FR-29.14, FR-29.15): what is done on each day of
 * the trip, read together from where it is written.
 *
 * A strip of the trip's days, the chosen day's timeline and tomorrow's below
 * it, a bar for the shortlisted ideas that have no day yet, and the ＋ for an
 * entry of the plan's own. What stands on a day is `domain/dayPlan.ts`'s rule;
 * the excursions and tasks come from the packing side through the kernel's
 * `lib/dayPlanSources.ts`, with their writes bound in, so this module never
 * imports them (FR-29.9).
 */
import { IonContent, IonFab, IonFabButton, IonIcon, IonPage } from '@ionic/vue'
import {
  addOutline,
  bulbOutline,
  calendarOutline,
  carOutline,
  checkboxOutline,
  chevronForward,
  createOutline,
  trailSignOutline,
} from 'ionicons/icons'
import { computed, inject, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import EmptyState from '@/components/global/EmptyState.vue'
import ProgressRing from '@/components/global/ProgressRing.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripScreen } from '@/composables/useTripScreen'
import { formatDate, t } from '@/i18n'
import { confirmDestructive } from '@/lib/confirm'
import { DAY_PLAN_SOURCES } from '@/lib/dayPlanSources'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { shortDueDay } from '@/lib/taskDueText'
import { presentToast } from '@/lib/toast'
import { tripIdeasPath } from '@/router/paths'
import type { DayEntry, Idea } from '@/types/domain'
import { IDEA_STATE_DONE, IDEA_STATE_SHORTLISTED } from '@/types/domain'
import { createPlannerActions, type DayEntryFields } from './actions'
import DayEntrySheet from './DayEntrySheet.vue'
import {
  DAY_LINE,
  dayCounts,
  dayLines,
  ideasOutsideTrip,
  nextDay,
  openingDay,
  tripDays,
  unplannedIdeas,
  type DayInput,
  type DayLine,
  type DayLineKind,
} from './domain/dayPlan'
import { usePlannerStore } from './store'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const plannerStore = usePlannerStore()
const actions = createPlannerActions(orchestrator.moduleHost, plannerStore)
const router = useRouter()
const sources = inject(DAY_PLAN_SOURCES, [])

const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)
const { myUserId, nameOf, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)

onMounted(async () => {
  await ensure()
  await loadIdentity()
})

setHeaderTitle(
  () => t('dayPlan.title'),
  () => trip.value?.name,
)

// --- the days ---

const days = computed(() => tripDays(trip.value))

/** The day shown; null until the trip's dates are known. */
const chosen = ref<string | null>(null)
watch(
  days,
  (list) => {
    if (chosen.value === null || !list.includes(chosen.value)) {
      chosen.value = openingDay(list, orchestrator.today())
    }
  },
  { immediate: true },
)

const input = computed<DayInput>(() => ({
  trip: { start_date: trip.value?.start_date ?? null, end_date: trip.value?.end_date ?? null },
  ideas: plannerStore.getIdeas(props.tripId),
  entries: plannerStore.getDayEntries(props.tripId),
  lines: sources.flatMap((source) => source.lines(props.tripId)),
}))

const counts = computed(() => dayCounts(days.value, input.value))
const today = computed(() => orchestrator.today())
const chosenLines = computed(() => (chosen.value ? dayLines(chosen.value, input.value) : []))
const tomorrow = computed(() => {
  if (!chosen.value) return null
  const day = nextDay(chosen.value)
  return days.value.includes(day) ? day : null
})
const tomorrowLines = computed(() => (tomorrow.value ? dayLines(tomorrow.value, input.value) : []))

const pool = computed(() => unplannedIdeas(plannerStore.getIdeas(props.tripId)))
const outside = computed(() => ideasOutsideTrip(plannerStore.getIdeas(props.tripId), days.value))

/** „Mi., 15.7." — a strip tile's two halves and the day's own heading. */
function weekday(day: string): string {
  return formatDate(localDay(day), { weekday: 'short' })
}
function dayOfMonth(day: string): string {
  return formatDate(localDay(day), { day: 'numeric' })
}
function localDay(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

const chosenHeading = computed(() =>
  chosen.value
    ? t('dayPlan.dayOf', {
        day: shortDueDay(chosen.value),
        n: days.value.indexOf(chosen.value) + 1,
        total: days.value.length,
      })
    : '',
)

// --- one line ---

const KIND_ICON: Record<DayLineKind, string> = {
  [DAY_LINE.arrival]: carOutline,
  [DAY_LINE.departure]: carOutline,
  [DAY_LINE.excursion]: trailSignOutline,
  [DAY_LINE.idea]: bulbOutline,
  [DAY_LINE.task]: checkboxOutline,
  [DAY_LINE.entry]: createOutline,
}

function kindLabel(line: DayLine): string {
  const label = t(`dayPlan.kind.${line.kind}`)
  if (line.span === 'start') return `${label} · ${t('dayPlan.spanStart')}`
  if (line.span === 'return') return `${label} · ${t('dayPlan.spanReturn')}`
  return label
}

function titleOf(line: DayLine): string {
  if (line.kind === DAY_LINE.arrival) return t('dayPlan.arrival')
  if (line.kind === DAY_LINE.departure) return t('dayPlan.departure')
  return line.title
}

function detailOf(line: DayLine): string | null {
  if (line.kind === DAY_LINE.task) return nameOf(line.source?.assignee ?? null)
  return line.detail
}

function open(line: DayLine) {
  if (line.idea) void router.push(tripIdeasPath(props.tripId, line.idea.id))
  else if (line.entry) editing.value = { entry: line.entry }
  else if (line.source) void router.push(line.source.path)
}

function tick(line: DayLine) {
  if (line.idea) {
    actions.setState(line.idea, line.done ? IDEA_STATE_SHORTLISTED : IDEA_STATE_DONE)
  } else {
    line.source?.toggle?.()
  }
}

// --- the pool and the ＋ ---

const poolOpen = ref(false)
const editing = ref<{ entry: DayEntry | null } | null>(null)

function plan(idea: Idea, day: string) {
  actions.planIdea(idea, day, null)
  void presentToast({
    message: t('dayPlan.planned', { title: idea.title, day: shortDueDay(day) }),
    positionAnchor: FAB_ANCHOR.m29,
  })
}

function planOnChosen(idea: Idea) {
  editing.value = null
  if (chosen.value) plan(idea, chosen.value)
}

function onSave(fields: DayEntryFields) {
  const current = editing.value
  editing.value = null
  if (current?.entry) actions.updateDayEntry(current.entry, fields)
  else if (chosen.value) actions.addDayEntry(props.tripId, chosen.value, fields, myUserId.value)
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
  <IonPage>
    <IonContent class="plan-content" data-testid="m29-page">
      <template v-if="loaded">
        <EmptyState
          v-if="days.length === 0"
          :icon="calendarOutline"
          :title="t('dayPlan.noDates')"
          testid="m29-no-dates"
        />
        <template v-else>
          <div class="strip" role="tablist" data-testid="m29-strip">
            <button
              v-for="day in days"
              :key="day"
              type="button"
              role="tab"
              class="tile"
              :class="{ past: day < today }"
              :aria-selected="day === chosen ? 'true' : 'false'"
              :data-testid="`m29-day-${day}`"
              @click="chosen = day"
            >
              <small>{{ weekday(day) }}</small>
              <b class="jp-num">{{ dayOfMonth(day) }}</b>
              <span class="dots" aria-hidden="true">
                <i v-for="n in Math.min(3, counts.get(day) ?? 0)" :key="n" />
              </span>
            </button>
          </div>

          <h2 class="day-heading" data-testid="m29-day-heading">{{ chosenHeading }}</h2>
          <div class="timeline jp-card" data-testid="m29-timeline">
            <p v-if="chosenLines.length === 0" class="empty" data-testid="m29-empty">
              {{ t('dayPlan.emptyDay') }}
            </p>
            <div
              v-for="line in chosenLines"
              :key="line.key"
              class="line"
              :data-kind="line.kind"
              :data-done="line.done ? 'true' : undefined"
              :data-testid="`m29-line-${line.key}`"
            >
              <button type="button" class="open" @click="open(line)">
                <span class="time jp-num">{{ line.time ?? t('dayPlan.noTime') }}</span>
                <span class="body">
                  <span class="kind">
                    <IonIcon :icon="KIND_ICON[line.kind]" aria-hidden="true" />
                    {{ kindLabel(line) }}
                  </span>
                  <span class="title">{{ titleOf(line) }}</span>
                  <span v-if="detailOf(line)" class="detail">{{ detailOf(line) }}</span>
                </span>
              </button>
              <ProgressRing
                v-if="line.progress !== null"
                :percent="line.progress * 100"
                :size="28"
              />
              <button
                v-else-if="line.done !== null"
                type="button"
                class="tick"
                :aria-pressed="line.done ? 'true' : 'false'"
                :aria-label="t('dayPlan.tick', { title: titleOf(line) })"
                :data-testid="`m29-tick-${line.key}`"
                @click="tick(line)"
              >
                <span aria-hidden="true">{{ line.done ? '✓' : '' }}</span>
              </button>
            </div>
          </div>

          <template v-if="tomorrow">
            <h3 class="group" data-testid="m29-tomorrow">
              <span>{{ t('dayPlan.tomorrow', { day: shortDueDay(tomorrow) }) }}</span>
              <span class="jp-num">{{ tomorrowLines.length }}</span>
            </h3>
            <div class="timeline jp-card" data-testid="m29-tomorrow-list">
              <p v-if="tomorrowLines.length === 0" class="empty">{{ t('dayPlan.emptyDay') }}</p>
              <div
                v-for="line in tomorrowLines"
                :key="line.key"
                class="line"
                :data-kind="line.kind"
                :data-done="line.done ? 'true' : undefined"
              >
                <button type="button" class="open" @click="open(line)">
                  <span class="time jp-num">{{ line.time ?? t('dayPlan.noTime') }}</span>
                  <span class="body">
                    <span class="kind">
                      <IonIcon :icon="KIND_ICON[line.kind]" aria-hidden="true" />
                      {{ kindLabel(line) }}
                    </span>
                    <span class="title">{{ titleOf(line) }}</span>
                  </span>
                </button>
              </div>
            </div>
          </template>

          <template v-if="outside.length > 0">
            <h3 class="group" data-testid="m29-outside">
              <span>{{ t('dayPlan.outside') }}</span>
              <span class="jp-num">{{ outside.length }}</span>
            </h3>
            <div class="timeline jp-card">
              <div v-for="idea in outside" :key="idea.id" class="line" data-kind="idea">
                <button
                  type="button"
                  class="open"
                  @click="router.push(tripIdeasPath(tripId, idea.id))"
                >
                  <span class="time jp-num">{{ shortDueDay(idea.planned_on!) }}</span>
                  <span class="body"
                    ><span class="title">{{ idea.title }}</span></span
                  >
                </button>
              </div>
            </div>
          </template>

          <button
            v-if="pool.length > 0"
            slot="fixed"
            type="button"
            class="pool-bar"
            data-testid="m29-pool"
            @click="poolOpen = true"
          >
            <span>{{ t('dayPlan.pool', { n: pool.length }) }}</span>
            <IonIcon :icon="chevronForward" aria-hidden="true" />
          </button>
        </template>
      </template>

      <IonFab
        v-if="days.length > 0"
        :id="FAB_ANCHOR.m29"
        slot="fixed"
        vertical="bottom"
        horizontal="end"
      >
        <IonFabButton
          :aria-label="t('dayPlan.newTitle', { day: chosen ? shortDueDay(chosen) : '' })"
          data-testid="m29-fab"
          @click="editing = { entry: null }"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <DayEntrySheet
        :open="editing !== null"
        :entry="editing?.entry ?? null"
        :day-text="chosen ? shortDueDay(chosen) : ''"
        :pool="pool"
        @close="editing = null"
        @save="onSave"
        @remove="onRemove"
        @plan="planOnChosen"
      />

      <SheetModal :is-open="poolOpen" testid="m29-pool-sheet" @dismiss="poolOpen = false">
        <section v-if="poolOpen" class="pool-sheet">
          <SheetHead
            :title="t('dayPlan.poolTitle')"
            title-testid="m29-pool-title"
            close-testid="m29-pool-close"
            @close="poolOpen = false"
          />
          <p v-if="pool.length === 0" class="empty">{{ t('dayPlan.poolEmpty') }}</p>
          <div
            v-for="idea in pool"
            :key="idea.id"
            class="pool-row"
            :data-testid="`m29-pool-${idea.id}`"
          >
            <span class="title">{{ idea.title }}</span>
            <div class="chips">
              <ChoiceChip
                v-for="day in days"
                :key="day"
                :pressed="false"
                :data-testid="`m29-pool-${idea.id}-${day}`"
                @click="plan(idea, day)"
              >
                {{ shortDueDay(day) }}
              </ChoiceChip>
            </div>
          </div>
        </section>
      </SheetModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.plan-content {
  --padding-top: 6px;
  /* Room for the pool bar and the FAB over the last card. */
  --padding-bottom: 96px;
}

.strip {
  display: flex;
  gap: 6px;
  margin: 0 12px 12px;
  overflow-x: auto;
  scrollbar-width: none;
}

.tile {
  display: flex;
  flex: 0 0 48px;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 6px 0 5px;
  border: 0;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-card);
  color: var(--ct-text);
  font: inherit;
  cursor: pointer;
}

.tile small {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.tile b {
  font-size: var(--jp-text-lg);
}

.tile.past {
  opacity: 0.55;
}

.tile[aria-selected='true'] {
  background: var(--jp-action);
  color: var(--ct-base);
  opacity: 1;
}

.tile[aria-selected='true'] small {
  color: var(--ct-base);
}

.dots {
  display: flex;
  gap: 2px;
  height: 5px;
}

.dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}

.day-heading {
  margin: 0 18px 8px;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
}

.timeline {
  margin: 0 12px 12px;
  padding: 4px 0;
}

.empty {
  margin: 10px 16px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 8px;
  padding-right: 10px;
  border-left: 4px solid var(--ct-overlay0);
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-sunken);
}

.line[data-kind='idea'] {
  border-left-color: var(--ct-larch);
}
.line[data-kind='excursion'] {
  border-left-color: var(--ct-moss);
}
.line[data-kind='task'] {
  border-left-color: var(--ct-glacier);
}
.line[data-kind='entry'] {
  border-left-color: var(--ct-heather);
}
.line[data-kind='arrival'],
.line[data-kind='departure'] {
  border-left-color: var(--ct-straw);
}

.open {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 4px 9px 10px;
  border: 0;
  background: transparent;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.time {
  flex: 0 0 44px;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.kind {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.kind ion-icon {
  font-size: var(--jp-icon-xs);
}

.title {
  font-weight: var(--jp-weight-semibold);
  overflow-wrap: anywhere;
}

.line[data-done='true'] .title {
  color: var(--ct-subtext0);
  text-decoration: line-through;
}

.detail {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.tick {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 2px solid var(--ct-surface2);
  border-radius: 50%;
  background: transparent;
  color: var(--ct-base);
  font: inherit;
  cursor: pointer;
}

.tick[aria-pressed='true'] {
  border-color: var(--jp-done);
  background: var(--jp-done);
}

.group {
  display: flex;
  justify-content: space-between;
  margin: 14px 18px 6px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.pool-bar {
  position: absolute;
  right: 84px;
  bottom: 18px;
  left: 12px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border: 0;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-card);
  box-shadow: var(--jp-shadow);
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-sm);
  text-align: start;
  cursor: pointer;
}

.pool-sheet {
  padding: 4px 16px 18px;
}

.pool-row {
  padding: 10px 0;
  border-bottom: 1px solid var(--jp-surface-border);
}

.pool-row .chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
</style>
