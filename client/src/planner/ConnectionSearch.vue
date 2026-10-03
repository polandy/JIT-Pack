<script setup lang="ts">
/**
 * The Swiss timetable inside the connection sheet (FR-29.18, ADR-086): two
 * stops with suggestions, a time that is the departure's or the arrival's, and
 * the connections found, each with the slack it leaves; a tap takes one. A
 * stop abroad or a service that does not answer says so and leaves the link
 * and the hand fields below, which stay the way to write any connection.
 */
import { IonButton, IonInput, IonSegment, IonSegmentButton, IonLabel } from '@ionic/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import { t } from '@/i18n'
import type { ConnectionLeg } from '@/types/domain'
import { connectionSummary, timeOf } from './domain/connections'
import {
  slackMinutes,
  type SearchSeed,
  type TimetableOption,
  type TimetableStop,
} from './domain/timetable'
import { journeyDuration } from './journeyText'
import { createTimetableApi } from './timetableClient'

const props = defineProps<{
  /** The day searched on, `YYYY-MM-DD`. */
  day: string | null
  seed: SearchSeed
  /** A place whose nearest stop fills *Nach* where the seed has none: the route's start. */
  near: { lat: number; lon: number } | null
}>()

const emit = defineEmits<{ pick: [legs: ConnectionLeg[]] }>()

/** Where the last departure stop is kept, so the next way there starts from home. */
const LAST_FROM_KEY = 'jitpack_timetable_from'
/** Fewer typed characters than this ask nothing. */
const MIN_QUERY = 3
const DEPART = 'depart'
const ARRIVE = 'arrive'

const FIELD_FROM = 'from'
const FIELD_TO = 'to'
type Field = typeof FIELD_FROM | typeof FIELD_TO

const SEARCH_IDLE = 'idle'
const SEARCH_RUNNING = 'running'
const SEARCH_DONE = 'done'
const SEARCH_NO_STOP = 'noStop'
const SEARCH_FAILED = 'failed'
type SearchState =
  | typeof SEARCH_IDLE
  | typeof SEARCH_RUNNING
  | typeof SEARCH_DONE
  | typeof SEARCH_NO_STOP
  | typeof SEARCH_FAILED

const api = createTimetableApi()

const from = ref('')
const to = ref('')
const time = ref(props.seed.time)
const mode = ref<typeof DEPART | typeof ARRIVE>(DEPART)
const state = ref<SearchState>(SEARCH_IDLE)
const options = ref<TimetableOption[]>([])
const suggestions = ref<Record<Field, TimetableStop[]>>({ from: [], to: [] })

const generations: Record<Field, number> = { from: 0, to: 0 }
let searchGeneration = 0

const canSearch = computed(
  () =>
    props.day !== null &&
    from.value.trim() !== '' &&
    to.value.trim() !== '' &&
    /^\d{2}:\d{2}$/.test(time.value) &&
    state.value !== SEARCH_RUNNING,
)

function remembered(): string {
  try {
    return localStorage.getItem(LAST_FROM_KEY) ?? ''
  } catch {
    return ''
  }
}

function remember(stop: string) {
  try {
    localStorage.setItem(LAST_FROM_KEY, stop)
  } catch {
    // Storage unavailable → the next search starts empty.
  }
}

onMounted(async () => {
  from.value = props.seed.from || remembered()
  to.value = props.seed.to
  if (to.value !== '' || !props.near) return
  const mine = ++generations.to
  const stop = await api.stopNear(props.near.lat, props.near.lon)
  if (mine !== generations.to || to.value !== '') return
  if (stop) to.value = stop.name
  else state.value = SEARCH_NO_STOP
})

onUnmounted(() => {
  generations.from++
  generations.to++
  searchGeneration++
})

async function suggest(field: Field, value: string) {
  const mine = ++generations[field]
  const query = value.trim()
  if (query.length < MIN_QUERY) {
    suggestions.value[field] = []
    return
  }
  const stops = await api.stops(query)
  // A later keystroke is answered by its own request.
  if (mine !== generations[field]) return
  suggestions.value[field] = (stops ?? []).filter((s) => s.name !== query).slice(0, 4)
}

function onType(field: Field, event: CustomEvent) {
  const value = String((event.detail as { value?: unknown }).value ?? '')
  if (state.value === SEARCH_NO_STOP) state.value = SEARCH_IDLE
  void suggest(field, value)
}

function takeStop(field: Field, stop: TimetableStop) {
  generations[field]++
  if (field === FIELD_FROM) from.value = stop.name
  else to.value = stop.name
  suggestions.value[field] = []
}

async function search() {
  if (!canSearch.value || props.day === null) return
  const mine = ++searchGeneration
  state.value = SEARCH_RUNNING
  options.value = []
  suggestions.value = { from: [], to: [] }
  const found = await api.connections({
    from: from.value.trim(),
    to: to.value.trim(),
    day: props.day,
    time: time.value,
    arrive: mode.value === ARRIVE,
  })
  if (mine !== searchGeneration) return
  if (found === null) {
    state.value = SEARCH_FAILED
    return
  }
  options.value = found
  state.value = SEARCH_DONE
}

function onMode(event: CustomEvent) {
  const value = (event.detail as { value?: unknown }).value
  if (value === DEPART || value === ARRIVE) mode.value = value
}

function pick(option: TimetableOption) {
  remember(option.legs[0]!.from)
  emit('pick', option.legs)
}

/** What a connection leaves of the time before it: a gap, or how early it is. */
function slackText(option: TimetableOption): string | null {
  const slack = slackMinutes(option, props.seed.earliest)
  if (slack === null) return null
  return slack >= 0
    ? t('timetable.slack', { slack: journeyDuration(slack) })
    : t('timetable.tooEarly', { late: journeyDuration(-slack) })
}

const rows = computed(() =>
  options.value.map((option) => {
    const legs = option.legs
    const summary = connectionSummary(legs)
    const first = legs[0]!
    const changes =
      summary.transfers > 0 ? t('dayPlan.transfers', { n: summary.transfers }) : t('dayPlan.direct')
    return {
      option,
      title: `${timeOf(first.dep)} → ${summary.arrival}`,
      detail: [journeyDuration(option.minutes), changes, summary.lines.join(', ')]
        .filter(Boolean)
        .join(' · '),
      slack: slackText(option),
      late: (slackMinutes(option, props.seed.earliest) ?? 0) < 0,
      label: t('timetable.pick', {
        time: timeOf(first.dep),
        from: first.from,
        to: legs[legs.length - 1]!.to,
      }),
    }
  }),
)

const message = computed(() =>
  state.value === SEARCH_NO_STOP
    ? t('timetable.noStop')
    : state.value === SEARCH_FAILED
      ? t('timetable.failed')
      : state.value === SEARCH_DONE && options.value.length === 0
        ? t('timetable.noResult')
        : null,
)
</script>

<template>
  <section class="search" :aria-label="t('timetable.title')" data-testid="timetable-search">
    <IonInput
      v-model="from"
      :label="t('timetable.from')"
      label-placement="stacked"
      data-testid="timetable-from"
      @ionInput="onType(FIELD_FROM, $event)"
    />
    <div v-if="suggestions.from.length" class="stops" data-testid="timetable-from-stops">
      <ChoiceChip
        v-for="stop in suggestions.from"
        :key="stop.id"
        :pressed="false"
        :data-testid="`timetable-from-stop-${stop.id}`"
        @click="takeStop(FIELD_FROM, stop)"
      >
        {{ stop.name }}
      </ChoiceChip>
    </div>
    <IonInput
      v-model="to"
      :label="t('timetable.to')"
      label-placement="stacked"
      data-testid="timetable-to"
      @ionInput="onType(FIELD_TO, $event)"
    />
    <div v-if="suggestions.to.length" class="stops" data-testid="timetable-to-stops">
      <ChoiceChip
        v-for="stop in suggestions.to"
        :key="stop.id"
        :pressed="false"
        :data-testid="`timetable-to-stop-${stop.id}`"
        @click="takeStop(FIELD_TO, stop)"
      >
        {{ stop.name }}
      </ChoiceChip>
    </div>
    <div class="when">
      <IonSegment :value="mode" data-testid="timetable-mode" @ionChange="onMode">
        <IonSegmentButton :value="DEPART" data-testid="timetable-mode-depart">
          <IonLabel>{{ t('timetable.depart') }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton :value="ARRIVE" data-testid="timetable-mode-arrive">
          <IonLabel>{{ t('timetable.arrive') }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>
      <IonInput
        v-model="time"
        type="time"
        class="clock"
        :label="t('timetable.time')"
        label-placement="stacked"
        data-testid="timetable-time"
      />
    </div>
    <IonButton
      expand="block"
      fill="outline"
      :disabled="!canSearch"
      data-testid="timetable-submit"
      @click="search"
    >
      {{ state === SEARCH_RUNNING ? t('timetable.searching') : t('timetable.search') }}
    </IonButton>
    <p v-if="message" class="message" role="status" data-testid="timetable-message">
      {{ message }}
    </p>
    <ul v-if="rows.length" class="results" data-testid="timetable-results">
      <li v-for="(row, index) in rows" :key="index">
        <button
          type="button"
          class="result"
          :aria-label="row.label"
          :data-testid="`timetable-result-${index}`"
          @click="pick(row.option)"
        >
          <span class="title jp-num">{{ row.title }}</span>
          <span class="detail">{{ row.detail }}</span>
          <span
            v-if="row.slack"
            class="slack jp-num"
            :data-late="row.late ? 'true' : 'false'"
            data-testid="timetable-slack"
          >
            {{ row.slack }}
          </span>
        </button>
      </li>
    </ul>
    <p class="or">{{ t('timetable.byHand') }}</p>
  </section>
</template>

<style scoped>
.search ion-input {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  margin-top: 10px;
  border-radius: var(--jp-r-md);
}

.stops {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.when {
  display: grid;
  grid-template-columns: 1fr 120px;
  align-items: end;
  column-gap: 8px;
}

.when ion-segment {
  margin-top: 10px;
}

.search ion-button {
  margin-top: 10px;
}

.message {
  margin: 10px 2px 0;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.results {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.result {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  border: none;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

li + li .result {
  margin-top: 6px;
}

.result:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}

.title {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}

.detail {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.slack {
  color: var(--jp-done);
  font-size: var(--jp-text-sm);
}

.slack[data-late='true'] {
  color: var(--ct-ember);
}

.or {
  margin: 14px 2px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}
</style>
