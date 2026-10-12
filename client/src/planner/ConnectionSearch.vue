<script setup lang="ts">
/**
 * The Swiss timetable in the connection step (FR-29.18, ADR-086): *Von* over
 * *Nach* with stop suggestions and a swap, a time that is the departure's or
 * the arrival's, and the connections found as soon as both stops stand —
 * there is no search button — each with the slack it leaves; a tap takes one.
 * *Von* may be where the device is: the stops near it are offered, and each
 * connection then opens with the walk to its stop. A stop abroad or a
 * service that does not answer says so; the link and the hand fields below
 * stay the way to write any connection.
 */
import { IonIcon, IonInput, IonLabel, IonSegment, IonSegmentButton, IonSpinner } from '@ionic/vue'
import { checkmarkCircle, locateOutline, swapVertical } from 'ionicons/icons'
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import TimeField from '@/components/global/TimeField.vue'
import { LIVE_LOCATION } from '@/composables/shared/useLiveLocation'
import { t } from '@/i18n'
import { shortDueDay } from '@/lib/taskDueText'
import type { ConnectionLeg } from './types'
import { legHue } from './connectionMap'
import { connectionSummary, timeOf } from './domain/connections'
import {
  slackMinutes,
  startFromHere,
  type Here,
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
/** How many stops a typed name suggests. */
const SUGGESTED_STOPS = 4
/** How far back *Früher* looks for connections before the first one listed. */
const EARLIER_MINUTES = 60
const CLOCK = /^\d{2}:\d{2}$/
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
const SEARCH_NO_HERE = 'noHere'
type SearchState =
  | typeof SEARCH_IDLE
  | typeof SEARCH_RUNNING
  | typeof SEARCH_DONE
  | typeof SEARCH_NO_STOP
  | typeof SEARCH_FAILED
  | typeof SEARCH_NO_HERE

const api = createTimetableApi()
const live = inject(LIVE_LOCATION, null)

const from = ref('')
const to = ref('')
const time = ref(props.seed.time)
const mode = ref<typeof DEPART | typeof ARRIVE>(DEPART)
const state = ref<SearchState>(SEARCH_IDLE)
const options = ref<TimetableOption[]>([])
/** The result taken, marked where it was tapped. */
const picked = ref<number | null>(null)
const suggestions = ref<Record<Field, TimetableStop[]>>({ from: [], to: [] })
/** *Nach* was found as the stop nearest the route's start. */
const toNearStart = ref(false)
/** *Früher* or *Später* is asking. */
const moreRunning = ref<'earlier' | 'later' | null>(null)

// --- from where one is ---

/** Where the device was when *Mein Standort* was tapped; null while *Von* is typed. */
const here = ref<Here | null>(null)
/** The stops near it, the nearest first. */
const nearby = ref<TimetableStop[]>([])
/** The one of them *Von* is. */
const hereStop = ref<TimetableStop | null>(null)
const locating = ref(false)
/** The page may have a position at all — a page not served over HTTPS has none. */
const hereOffered = computed(() => !!live && live.state.value !== 'unavailable')

const generations: Record<Field, number> = { from: 0, to: 0 }
let searchGeneration = 0
/**
 * The question last asked. A field left without a change asks it again —
 * leaving *Von* for a tap on a result is such a leave — and must not clear
 * the very result the tap is about to land on.
 */
let asked = ''

const ready = computed(
  () =>
    props.day !== null &&
    from.value.trim() !== '' &&
    to.value.trim() !== '' &&
    CLOCK.test(time.value),
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
  if (to.value !== '' || !props.near) {
    void search()
    return
  }
  const mine = ++generations.to
  const stop = await api.stopNear(props.near.lat, props.near.lon)
  if (mine !== generations.to || to.value !== '') return
  if (!stop) {
    state.value = SEARCH_NO_STOP
    return
  }
  to.value = stop.name
  toNearStart.value = true
  void search()
})

onUnmounted(() => {
  generations.from++
  generations.to++
  searchGeneration++
  if (locating.value) live?.release()
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
  suggestions.value[field] = (stops ?? []).filter((s) => s.name !== query).slice(0, SUGGESTED_STOPS)
}

/** A stop being typed is not a stop yet: the list waits for the field to be left or a chip. */
function onType(field: Field, event: CustomEvent) {
  const value = String((event.detail as { value?: unknown }).value ?? '')
  if (field === FIELD_FROM) leaveHere()
  else toNearStart.value = false
  forgetResults()
  void suggest(field, value)
}

function takeStop(field: Field, stop: TimetableStop) {
  generations[field]++
  if (field === FIELD_FROM) from.value = stop.name
  else to.value = stop.name
  suggestions.value[field] = []
  void search()
}

function forgetResults() {
  searchGeneration++
  asked = ''
  moreRunning.value = null
  options.value = []
  picked.value = null
  if (state.value !== SEARCH_NO_STOP) state.value = SEARCH_IDLE
}

function swap() {
  leaveHere()
  toNearStart.value = false
  ;[from.value, to.value] = [to.value, from.value]
  void search()
}

async function ask(at: string, arrive: boolean): Promise<TimetableOption[] | null> {
  return api.connections({
    from: from.value.trim(),
    to: to.value.trim(),
    day: props.day!,
    time: at,
    arrive,
  })
}

async function search() {
  if (!ready.value) return
  const question = [from.value.trim(), to.value.trim(), props.day, time.value, mode.value].join('|')
  if (question === asked && state.value !== SEARCH_FAILED) return
  asked = question
  const mine = ++searchGeneration
  moreRunning.value = null
  state.value = SEARCH_RUNNING
  options.value = []
  picked.value = null
  const found = await ask(time.value, mode.value === ARRIVE)
  if (mine !== searchGeneration) return
  suggestions.value = { from: [], to: [] }
  if (found === null) {
    state.value = SEARCH_FAILED
    return
  }
  options.value = found
  state.value = SEARCH_DONE
}

/** The key two answers share a connection by: its first departure and last arrival. */
function keyOf(option: TimetableOption): string {
  return `${option.legs[0]!.dep}|${option.legs[option.legs.length - 1]!.arr}`
}

function clockMinus(clock: string, minutes: number): string {
  const [h = 0, m = 0] = clock.split(':').map(Number)
  const at = Math.max(0, h * 60 + m - minutes)
  return `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`
}

/** *Früher* and *Später*: the connections around those listed, added to them. */
async function more(later: boolean) {
  const list = options.value
  if (list.length === 0 || !ready.value) return
  const mine = ++searchGeneration
  const edge = later ? list[list.length - 1]! : list[0]!
  const at = timeOf(edge.legs[0]!.dep)
  moreRunning.value = later ? 'later' : 'earlier'
  const found = await ask(later ? clockMinus(at, -1) : clockMinus(at, EARLIER_MINUTES), false)
  if (mine !== searchGeneration) return
  moreRunning.value = null
  if (!found) return
  const known = new Set(list.map(keyOf))
  const fresh = found.filter((option) => {
    if (known.has(keyOf(option))) return false
    const dep = option.legs[0]!.dep
    return later ? dep > edge.legs[0]!.dep : dep < edge.legs[0]!.dep
  })
  options.value = later ? [...list, ...fresh] : [...fresh, ...list]
  if (!later && picked.value !== null) picked.value += fresh.length
}

function onMode(event: CustomEvent) {
  const value = (event.detail as { value?: unknown }).value
  if (value !== DEPART && value !== ARRIVE) return
  mode.value = value
  void search()
}

function onTimeSettled() {
  void search()
}

watch(
  () => props.day,
  () => void search(),
)

// --- from where one is ---

function leaveHere() {
  here.value = null
  hereStop.value = null
  nearby.value = []
  if (state.value === SEARCH_NO_HERE) state.value = SEARCH_IDLE
}

/** *Mein Standort*: asks the device once where it is — never on its own. */
function useHere() {
  if (!live) return
  if (live.state.value === 'denied') {
    state.value = SEARCH_NO_HERE
    return
  }
  const known = live.me.value
  if (known && live.state.value === 'on') {
    void startHere(known.lat, known.lon)
    return
  }
  locating.value = true
  live.hold()
  live.locate()
}

watch(
  () => [live?.me.value, live?.state.value] as const,
  ([me, located]) => {
    if (!locating.value || !live) return
    if (located === 'denied' || located === 'unavailable') {
      locating.value = false
      live.release()
      state.value = SEARCH_NO_HERE
      return
    }
    if (!me) return
    locating.value = false
    live.release()
    void startHere(me.lat, me.lon)
  },
)

async function startHere(lat: number, lon: number) {
  const mine = ++generations.from
  const stops = await api.stopsNear(lat, lon)
  if (mine !== generations.from) return
  if (!stops || stops.length === 0) {
    state.value = SEARCH_NO_STOP
    return
  }
  here.value = { label: t('timetable.here'), lat, lon }
  nearby.value = stops
  chooseNear(stops[0]!)
}

function chooseNear(stop: TimetableStop) {
  hereStop.value = stop
  from.value = stop.name
  suggestions.value.from = []
  void search()
}

/** A connection as it is taken: from where one is, the walk to its stop goes first. */
function started(option: TimetableOption): { option: TimetableOption; walk: number | null } {
  return here.value && hereStop.value
    ? startFromHere(option, here.value, hereStop.value)
    : { option, walk: null }
}

function pick(option: TimetableOption, index: number) {
  picked.value = index
  remember(option.legs[0]!.from)
  emit('pick', started(option).option.legs)
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
    const start = started(option)
    return {
      option,
      title: `${timeOf(first.dep)} → ${summary.arrival}`,
      minutes: journeyDuration(option.minutes),
      changes:
        summary.transfers > 0
          ? t('dayPlan.transfers', { n: summary.transfers })
          : t('dayPlan.direct'),
      lines: legs
        .filter((leg) => leg.line !== '')
        .map((leg) => ({ name: leg.line, hue: legHue(leg) })),
      walk:
        start.walk === null
          ? null
          : t('timetable.walk', {
              min: start.walk,
              time: timeOf(start.option.legs[0]!.dep),
            }),
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
      : state.value === SEARCH_NO_HERE
        ? t('timetable.hereDenied')
        : state.value === SEARCH_DONE && options.value.length === 0
          ? t('timetable.noResult')
          : null,
)
</script>

<template>
  <section class="search" :aria-label="t('timetable.title')" data-testid="timetable-search">
    <div class="route">
      <div class="row">
        <IonInput
          v-model="from"
          :label="t('timetable.from')"
          label-placement="stacked"
          data-testid="timetable-from"
          @ionInput="onType(FIELD_FROM, $event)"
          @ionChange="search"
        />
        <span v-if="hereStop" class="tag jp-num" data-testid="timetable-here-distance">
          {{ t('timetable.hereFar', { m: Math.round(hereStop.distance ?? 0) }) }}
        </span>
        <button
          v-else-if="hereOffered"
          type="button"
          class="here"
          :disabled="locating"
          data-testid="timetable-here"
          @click="useHere"
        >
          <IonIcon :icon="locateOutline" aria-hidden="true" />
          {{ t('timetable.here') }}
        </button>
      </div>
      <div class="row">
        <IonInput
          v-model="to"
          :label="t('timetable.to')"
          label-placement="stacked"
          data-testid="timetable-to"
          @ionInput="onType(FIELD_TO, $event)"
          @ionChange="search"
        />
        <span v-if="toNearStart" class="tag" data-testid="timetable-near-start">
          {{ t('timetable.nearStart') }}
        </span>
      </div>
      <button
        type="button"
        class="swap"
        :aria-label="t('timetable.swap')"
        data-testid="timetable-swap"
        @click="swap"
      >
        <IonIcon :icon="swapVertical" aria-hidden="true" />
      </button>
    </div>
    <!-- A suggestion pressed keeps the field's focus, so leaving it asks nothing before the tap lands. -->
    <div v-if="suggestions.from.length" class="stops" data-testid="timetable-from-stops">
      <ChoiceChip
        v-for="stop in suggestions.from"
        :key="stop.id"
        :pressed="false"
        :data-testid="`timetable-from-stop-${stop.id}`"
        @mousedown.prevent
        @click="takeStop(FIELD_FROM, stop)"
      >
        {{ stop.name }}
      </ChoiceChip>
    </div>
    <div v-if="suggestions.to.length" class="stops" data-testid="timetable-to-stops">
      <ChoiceChip
        v-for="stop in suggestions.to"
        :key="stop.id"
        :pressed="false"
        :data-testid="`timetable-to-stop-${stop.id}`"
        @mousedown.prevent
        @click="takeStop(FIELD_TO, stop)"
      >
        {{ stop.name }}
      </ChoiceChip>
    </div>
    <div v-if="nearby.length" class="near" data-testid="timetable-near">
      <span class="jp-eyebrow">{{ t('timetable.nearTitle') }}</span>
      <div class="stops">
        <ChoiceChip
          v-for="(stop, index) in nearby"
          :key="stop.id"
          :pressed="hereStop?.id === stop.id"
          :data-testid="`timetable-near-${index}`"
          @click="chooseNear(stop)"
        >
          {{ t('timetable.nearStop', { name: stop.name, m: Math.round(stop.distance ?? 0) }) }}
        </ChoiceChip>
      </div>
    </div>
    <p v-if="locating" class="message busy" role="status" data-testid="timetable-locating">
      <IonSpinner name="dots" aria-hidden="true" />
      {{ t('timetable.locating') }}
    </p>
    <div class="when">
      <IonSegment :value="mode" data-testid="timetable-mode" @ionChange="onMode">
        <IonSegmentButton :value="DEPART" data-testid="timetable-mode-depart">
          <IonLabel>{{ t('timetable.depart') }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton :value="ARRIVE" data-testid="timetable-mode-arrive">
          <IonLabel>{{ t('timetable.arrive') }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>
      <TimeField
        v-model="time"
        class="clock"
        :label="t('timetable.time')"
        label-placement="stacked"
        data-testid="timetable-time"
        @settle="onTimeSettled"
      />
      <span v-if="day" class="day">{{ shortDueDay(day) }}</span>
    </div>
    <p
      v-if="state === SEARCH_RUNNING"
      class="message busy"
      role="status"
      data-testid="timetable-busy"
    >
      <IonSpinner name="dots" aria-hidden="true" />
      {{ t('timetable.searching') }}
    </p>
    <p v-if="message" class="message" role="status" data-testid="timetable-message">
      {{ message }}
    </p>
    <div v-if="rows.length" class="results" data-testid="timetable-results">
      <button
        type="button"
        class="more"
        :disabled="moreRunning !== null"
        data-testid="timetable-earlier"
        @click="more(false)"
      >
        <IonSpinner v-if="moreRunning === 'earlier'" name="dots" aria-hidden="true" />
        <template v-else>{{ t('timetable.earlier') }}</template>
      </button>
      <button
        v-for="(row, index) in rows"
        :key="index"
        type="button"
        class="result"
        :aria-label="row.label"
        :aria-pressed="picked === index"
        :data-testid="`timetable-result-${index}`"
        @click="pick(row.option, index)"
      >
        <span v-if="row.walk" class="walk jp-num" data-testid="timetable-walk">{{ row.walk }}</span>
        <span class="head">
          <span class="title jp-num">
            {{ row.title }}
            <IonIcon
              v-if="picked === index"
              class="taken"
              :icon="checkmarkCircle"
              aria-hidden="true"
              data-testid="timetable-taken"
            />
          </span>
          <span class="minutes jp-num">{{ row.minutes }}</span>
        </span>
        <span class="detail">
          {{ row.changes }}
          <span v-for="(line, at) in row.lines" :key="at" class="line-chip" :data-hue="line.hue">{{
            line.name
          }}</span>
        </span>
        <span
          v-if="row.slack"
          class="slack jp-num"
          :data-late="row.late ? 'true' : 'false'"
          data-testid="timetable-slack"
        >
          {{ row.slack }}
        </span>
      </button>
      <button
        type="button"
        class="more later"
        :disabled="moreRunning !== null"
        data-testid="timetable-later"
        @click="more(true)"
      >
        <IonSpinner v-if="moreRunning === 'later'" name="dots" aria-hidden="true" />
        <template v-else>{{ t('timetable.later') }}</template>
      </button>
    </div>
  </section>
</template>

<style scoped>
.route {
  position: relative;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 52px;
}

.row + .row {
  border-top: 1px solid var(--jp-surface-border);
}

.route ion-input {
  --padding-start: 12px;
  --padding-end: 4px;
  flex: 1;
  min-width: 0;
}

.tag {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  white-space: nowrap;
}

.here {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  color: var(--jp-action);
  font: inherit;
  font-size: var(--jp-text-xs);
  white-space: nowrap;
  cursor: pointer;
}

.here:disabled {
  opacity: 0.6;
}

.swap {
  position: absolute;
  right: 10px;
  top: 50%;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--jp-surface-border);
  border-radius: 50%;
  background: var(--jp-surface-card);
  color: var(--ct-subtext1);
  transform: translateY(-50%);
  cursor: pointer;
}

.swap ion-icon {
  font-size: var(--jp-icon-sm);
}

.stops {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.near {
  margin-top: 10px;
}

.near .stops {
  flex-wrap: nowrap;
  overflow-x: auto;
}

.when {
  display: grid;
  grid-template-columns: 1fr 96px auto;
  align-items: end;
  column-gap: 8px;
  margin-top: 10px;
}

.when ion-segment {
  align-self: center;
}

.clock {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  border-radius: var(--jp-r-md);
}

.day {
  align-self: center;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  white-space: nowrap;
}

.message {
  margin: 10px 2px 0;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.busy {
  display: flex;
  align-items: center;
  gap: 8px;
}

.busy ion-spinner,
.more ion-spinner {
  width: 24px;
  height: 16px;
  color: var(--jp-action);
}

.results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

/* Connections arriving slide in, so the list is seen to answer. */
.result {
  animation: result-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes result-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .result {
    animation: none;
  }
}

.more {
  align-self: flex-start;
  padding: 4px 2px;
  border: none;
  background: none;
  color: var(--jp-action);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.more.later {
  align-self: flex-end;
}

.result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-height: 44px;
  padding: 9px 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.result[aria-pressed='true'] {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
  background: color-mix(in srgb, var(--jp-action) 14%, transparent);
}

.result:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}

.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.title {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}

.minutes {
  margin-left: auto;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.taken {
  color: var(--jp-action);
  font-size: var(--jp-icon-sm);
  vertical-align: -2px;
}

.walk,
.detail {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.line-chip {
  display: inline-block;
  margin-left: 4px;
  padding: 0 6px;
  border-radius: var(--jp-r-sm);
  background: var(--ct-ember);
  color: var(--ct-base);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.line-chip[data-hue='bus'] {
  background: var(--ct-glacier);
}

.line-chip[data-hue='boat'] {
  background: var(--ct-heather);
}

.slack {
  color: var(--jp-done);
  font-size: var(--jp-text-sm);
}

.slack[data-late='true'] {
  color: var(--ct-ember);
}
</style>
