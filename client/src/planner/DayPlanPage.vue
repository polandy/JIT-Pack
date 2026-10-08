<script setup lang="ts">
/**
 * M29 — a trip's day plan (FR-29.14, FR-29.15): what is done on each day of
 * the trip, read together from where it is written.
 *
 * A strip of the trip's days, the chosen day's timeline and tomorrow's below
 * it, a bar for the shortlisted ideas that have no day yet, and the ＋ for an
 * entry of the plan's own. What stands on a day is `domain/dayPlan.ts`'s rule;
 * the excursions and tasks come from the packing side through the kernel's
 * `kernel/dayPlanSources.ts`, with their writes bound in, so this module never
 * imports them (FR-29.9). A connection (FR-29.18) is an entry of its own kind,
 * read from a pasted link through the server's page read where there is one.
 */
import { IonContent, IonFab, IonFabButton, IonIcon, IonPage } from '@ionic/vue'
import { addOutline, calendarOutline, chevronForward } from 'ionicons/icons'
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import EmptyState from '@/components/global/EmptyState.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { setHeaderTitle } from '@/composables/shared/useHeaderTitle'
import { useIdeaSeed } from '@/composables/shared/useIdeaSeed'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { useTripIdentity } from '@/composables/shared/useTripIdentity'
import { useTripScreen } from '@/composables/shared/useTripScreen'
import { t } from '@/i18n'
import { confirmDestructive } from '@/composables/shared/confirm'
import { DAY_PLAN_SOURCES, DAY_PLAN_TRAVELERS } from '@/kernel/dayPlanSources'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { shortDueDay } from '@/lib/taskDueText'
import { presentToast } from '@/composables/shared/toast'
import { tripIdeasPath } from '@/router/paths'
import type { DayEntry, Idea } from '@/types/domain'
import { createPlannerActions, type DayEntryFields } from './actions'
import DayEntrySheet from './DayEntrySheet.vue'
import DayLineRow from './DayLineRow.vue'
import IdeaPlanSheet from './IdeaPlanSheet.vue'
import { stripDay } from './dayLineText'
import WhoChips from '@/components/global/WhoChips.vue'
import { readDayPlanFilter, writeDayPlanFilter } from './dayPlanFilter'
import {
  concerns,
  dayCounts,
  dayLines,
  entriesOutsideTrip,
  forOf,
  IDEA_LINE_PREFIX,
  ideasOutsideTrip,
  ideasWithExcursion,
  nextDay,
  openingDay,
  openingFilter,
  tripDays,
  unplannedIdeas,
  type DayInput,
  type DayLine,
} from './domain/dayPlan'
import { connectionDay } from './domain/connections'
import { usePageLinks } from './usePageLinks'
import { usePlannerStore } from './store'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const plannerStore = usePlannerStore()
const actions = createPlannerActions(orchestrator.moduleHost, plannerStore)
const router = useRouter()
const sources = inject(DAY_PLAN_SOURCES, [])
const travelersOf = inject(DAY_PLAN_TRAVELERS, () => [])
/** FR-29.15: whom an entry may be for, in roster order. */
const travelers = computed(() => travelersOf(props.tripId))

const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)
const { myUserId, nameOf, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)

onMounted(async () => {
  await ensure()
  await loadIdentity()
  identityLoaded.value = true
})

// --- whom the plan is narrowed to (FR-29.15) ---

/** The chosen people — null for everybody — as tapped, before the roster is applied. */
const forFilter = ref<string[] | null>(null)
/** The chosen people still on the trip, in roster order; null for everybody. */
const chosenFor = computed(() =>
  forFilter.value === null ? null : forOf(forFilter.value, travelers.value),
)

/** Who I am is known — the first visit opens on my traveller. */
const identityLoaded = ref(false)
/** The opening choice is made once, and never over a tap. */
let filterOpened = false
/*
 * Once the roster is here: after a reload the trip's travellers arrive after
 * the page mounts, and a choice read against an empty roster is everybody.
 */
watch([identityLoaded, travelers], ([ready, roster]) => {
  if (!ready || filterOpened || roster.length < 2) return
  filterOpened = true
  forFilter.value = openingFilter(readDayPlanFilter(props.tripId), roster, myUserId.value)
})

function onFilter(next: string[] | null) {
  filterOpened = true
  forFilter.value = next
  writeDayPlanFilter(props.tripId, next)
}

/** One day's lines that concern the chosen, and how many others it leaves out. */
function narrowed(lines: DayLine[]): { lines: DayLine[]; hidden: number } {
  const shown = lines.filter((line) => concerns(line, chosenFor.value, travelers.value))
  return { lines: shown, hidden: lines.length - shown.length }
}

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
  travelers: travelers.value,
  entryTravelers: plannerStore.getDayEntryTravelers(props.tripId),
}))

const counts = computed(() => dayCounts(days.value, input.value, chosenFor.value))
const today = computed(() => orchestrator.today())
const chosenDay = computed(() => narrowed(chosen.value ? dayLines(chosen.value, input.value) : []))
const chosenLines = computed(() => chosenDay.value.lines)
const tomorrow = computed(() => {
  if (!chosen.value) return null
  const day = nextDay(chosen.value)
  return days.value.includes(day) ? day : null
})
const tomorrowDay = computed(() =>
  narrowed(tomorrow.value ? dayLines(tomorrow.value, input.value) : []),
)
const tomorrowLines = computed(() => tomorrowDay.value.lines)

const withExcursion = computed(() => ideasWithExcursion(input.value.lines))
const pool = computed(() =>
  unplannedIdeas(plannerStore.getIdeas(props.tripId), withExcursion.value),
)
const outside = computed(() =>
  ideasOutsideTrip(plannerStore.getIdeas(props.tripId), days.value, withExcursion.value),
)
const outsideEntries = computed(() =>
  entriesOutsideTrip(plannerStore.getDayEntries(props.tripId), days.value),
)

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

function open(line: DayLine) {
  if (line.idea) void router.push(tripIdeasPath(props.tripId, line.idea.id))
  else if (line.entry) editing.value = { entry: line.entry }
  else if (line.source?.open) line.source.open()
  else if (line.source) void router.push(line.source.path)
}

function tick(line: DayLine) {
  line.source?.toggle?.()
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

// --- one idea, sent from M28 (FR-29.14) ---

/** The idea M28's *Einplanen…* opened the sheet on; null while it is shut. */
const planning = ref<Idea | null>(null)

useIdeaSeed(
  props.tripId,
  () => loaded.value,
  (seed) => {
    planning.value = plannerStore.getIdea(seed.id) ?? null
  },
)

/** The idea as it stands now — it may have changed while the sheet was open. */
function takePlanning(): Idea | undefined {
  const id = planning.value?.id
  planning.value = null
  return id ? plannerStore.getIdea(id) : undefined
}

/** The plan goes to the idea's day, and to its line, so the person sees where it now stands. */
async function onPlanIdea(day: string, time: string | null) {
  const idea = takePlanning()
  if (!idea) return
  actions.planIdea(idea, day, time)
  if (days.value.includes(day)) chosen.value = day
  await nextTick()
  document
    .querySelector(`[data-testid="m29-line-${IDEA_LINE_PREFIX}${idea.id}"]`)
    ?.scrollIntoView({ block: 'center' })
  void presentToast({
    message: t('dayPlan.planned', { title: idea.title, day: shortDueDay(day) }),
    positionAnchor: FAB_ANCHOR.m29,
  })
}

function onUnplanIdea() {
  const idea = takePlanning()
  if (!idea) return
  actions.planIdea(idea, null, null)
  void presentToast({
    message: t('dayPlan.unplanned', { title: idea.title }),
    positionAnchor: FAB_ANCHOR.m29,
  })
}

const pageLinks = usePageLinks(props.tripId, orchestrator)

/** An entry lands on the day its connection names, and the plan goes there with it. */
/** FR-29.15: whom the entry being changed is for — null for everybody, as for a new one. */
const editingWho = computed(() => {
  const id = editing.value?.entry?.id
  if (!id) return null
  const named = plannerStore
    .getDayEntryTravelers(props.tripId)
    .filter((row) => row.day_entry_id === id)
    .map((row) => row.traveler_id)
  // In roster order and without anyone gone from the trip, as the line names them.
  const roster = travelers.value.filter((traveler) => named.includes(traveler.id))
  return roster.length > 0 ? roster.map((traveler) => traveler.id) : null
})

function onSave(fields: DayEntryFields) {
  const current = editing.value
  editing.value = null
  if (current?.entry) actions.updateDayEntry(current.entry, fields)
  else if (chosen.value) actions.addDayEntry(props.tripId, chosen.value, fields, myUserId.value)
  const legs = fields.connection?.legs
  if (legs) {
    const day = connectionDay(legs)
    if (days.value.includes(day)) chosen.value = day
  }
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
              <small>{{ stripDay(day).weekday }}</small>
              <b class="jp-num">{{ stripDay(day).date }}</b>
              <span class="dots" aria-hidden="true">
                <i v-for="n in Math.min(3, counts.get(day) ?? 0)" :key="n" />
              </span>
            </button>
          </div>

          <div v-if="travelers.length > 1" class="filter">
            <span class="jp-eyebrow">{{ t('dayPlan.filterLabel') }}</span>
            <WhoChips
              :travelers="travelers"
              :who="chosenFor"
              :all-label="t('dayPlan.everybody')"
              test-key="m29"
              @update="onFilter"
            />
          </div>

          <h2 class="day-heading" data-testid="m29-day-heading">{{ chosenHeading }}</h2>
          <div class="timeline jp-card" data-testid="m29-timeline">
            <p
              v-if="chosenLines.length === 0 && chosenDay.hidden === 0"
              class="empty"
              data-testid="m29-empty"
            >
              {{ t('dayPlan.emptyDay') }}
            </p>
            <DayLineRow
              v-for="line in chosenLines"
              :key="line.key"
              :line="line"
              :name-of="nameOf"
              @open="open(line)"
              @tick="tick(line)"
            />
            <p v-if="chosenDay.hidden > 0" class="hidden" data-testid="m29-hidden">
              <span>{{ t('dayPlan.hiddenLines', { n: chosenDay.hidden }) }}</span>
              <button type="button" data-testid="m29-show-all" @click="onFilter(null)">
                {{ t('dayPlan.showAll') }}
              </button>
            </p>
          </div>

          <template v-if="tomorrow">
            <h3 class="group" data-testid="m29-tomorrow">
              <span>{{ t('dayPlan.tomorrow', { day: shortDueDay(tomorrow) }) }}</span>
              <span class="jp-num">{{ tomorrowLines.length }}</span>
            </h3>
            <div class="timeline jp-card" data-testid="m29-tomorrow-list">
              <p v-if="tomorrowLines.length === 0 && tomorrowDay.hidden === 0" class="empty">
                {{ t('dayPlan.emptyDay') }}
              </p>
              <DayLineRow
                v-for="line in tomorrowLines"
                :key="line.key"
                :line="line"
                :name-of="nameOf"
                @open="open(line)"
                @tick="tick(line)"
              />
              <p v-if="tomorrowDay.hidden > 0" class="hidden" data-testid="m29-tomorrow-hidden">
                <span>{{ t('dayPlan.hiddenLines', { n: tomorrowDay.hidden }) }}</span>
                <button type="button" @click="onFilter(null)">{{ t('dayPlan.showAll') }}</button>
              </p>
            </div>
          </template>

          <template v-if="outside.length + outsideEntries.length > 0">
            <h3 class="group" data-testid="m29-outside">
              <span>{{ t('dayPlan.outside') }}</span>
              <span class="jp-num">{{ outside.length + outsideEntries.length }}</span>
            </h3>
            <div class="timeline jp-card">
              <button
                v-for="entry in outsideEntries"
                :key="entry.id"
                type="button"
                class="outside-row"
                :data-testid="`m29-outside-${entry.id}`"
                @click="editing = { entry }"
              >
                <span class="day jp-num">{{ shortDueDay(entry.on_date) }}</span>
                <span class="name">{{ entry.title }}</span>
              </button>
              <button
                v-for="idea in outside"
                :key="idea.id"
                type="button"
                class="outside-row"
                :data-testid="`m29-outside-${idea.id}`"
                @click="router.push(tripIdeasPath(tripId, idea.id))"
              >
                <span class="day jp-num">{{ shortDueDay(idea.planned_on!) }}</span>
                <span class="name">{{ idea.title }}</span>
              </button>
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
        <!-- Keyed on the day: Ionic copies aria-label onto its inner button
             once, at load, so a FAB that outlives a change of day would go on
             naming the first one (FR-21.24). -->
        <IonFabButton
          :key="chosen ?? ''"
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
        :day="chosen"
        :day-text="chosen ? shortDueDay(chosen) : ''"
        :pool="pool"
        :page-links="pageLinks"
        :travelers="travelers"
        :traveler-ids="editing?.entry ? editingWho : chosenFor"
        @close="editing = null"
        @save="onSave"
        @remove="onRemove"
        @plan="planOnChosen"
      />

      <IdeaPlanSheet
        :idea="planning"
        :days="days"
        :fallback-day="chosen"
        @close="planning = null"
        @save="onPlanIdea"
        @unplan="onUnplanIdea"
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

/* FR-29.15: whom the plan is narrowed to, under the strip. */
.filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 16px 12px;
}

/* What the filter leaves out, said so nothing seems lost. */
.hidden {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 8px;
  padding: 8px;
  border-top: 1px dashed var(--ct-surface1);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.hidden button {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--jp-action);
  font: inherit;
  font-weight: var(--jp-weight-semibold);
}

.empty {
  margin: 10px 16px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

/* An idea planned on a day the trip no longer has: its day, then its title. */
.outside-row {
  display: flex;
  gap: 10px;
  width: calc(100% - 16px);
  margin: 6px 8px;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.outside-row .day {
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.outside-row .name {
  font-weight: var(--jp-weight-semibold);
  overflow-wrap: anywhere;
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
