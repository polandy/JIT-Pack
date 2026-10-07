<script setup lang="ts">
/**
 * One line of the day plan's timeline (FR-29.15): its time, its kind with a
 * coloured edge, its title and second line, and — by kind — one trailing
 * shape: a meal's or an excursion's ring, part of the line's tap; a task's
 * checkbox, M25's; for an entry carrying a connection its legs opened in
 * place and its map (FR-29.18); nothing else. Today's card and tomorrow's
 * render the same row.
 */
import { IonCheckbox, IonIcon } from '@ionic/vue'
import {
  bulbOutline,
  carOutline,
  checkboxOutline,
  chevronForward,
  createOutline,
  restaurantOutline,
  trailSignOutline,
  trainOutline,
} from 'ionicons/icons'
import { computed, ref } from 'vue'

import ProgressRing from '@/components/global/ProgressRing.vue'
import { t } from '@/i18n'
import type { NameOf } from '@/lib/rowFacts'
import ConnectionLegs from './ConnectionLegs.vue'
import ConnectionMapView from './ConnectionMapView.vue'
import { dayLineTime, dayLineWords } from './dayLineText'
import { hasMap } from './domain/connections'
import { DAY_LINE, type DayLine, type DayLineKind } from './domain/dayPlan'

const props = defineProps<{ line: DayLine; nameOf: NameOf }>()
const emit = defineEmits<{ open: []; tick: [] }>()

const KIND_ICON: Record<DayLineKind, string> = {
  [DAY_LINE.arrival]: carOutline,
  [DAY_LINE.departure]: carOutline,
  [DAY_LINE.excursion]: trailSignOutline,
  [DAY_LINE.idea]: bulbOutline,
  [DAY_LINE.task]: checkboxOutline,
  [DAY_LINE.entry]: createOutline,
  [DAY_LINE.connection]: trainOutline,
  [DAY_LINE.meal]: restaurantOutline,
}

const words = computed(() => dayLineWords(props.line, props.nameOf))
const time = computed(() => dayLineTime(props.line))
const legs = computed(() =>
  props.line.kind === DAY_LINE.connection ? (props.line.entry?.legs ?? null) : null,
)
const legsOpen = ref(false)
const drawable = computed(() => !!legs.value && hasMap(legs.value))
const mapOpen = ref(false)
</script>

<template>
  <div
    class="line"
    :data-kind="line.kind"
    :data-done="line.done ? 'true' : undefined"
    :data-testid="`m29-line-${line.key}`"
  >
    <button type="button" class="open" @click="emit('open')">
      <span
        class="time jp-num"
        :class="{ word: time.word }"
        :data-testid="`m29-time-${line.key}`"
        >{{ time.text }}</span
      >
      <span class="body">
        <span class="kind">
          <IonIcon :icon="KIND_ICON[line.kind]" aria-hidden="true" />
          {{ words.kind }}
        </span>
        <span class="title">{{ words.title }}</span>
        <span v-if="words.detail" class="detail">{{ words.detail }}</span>
        <span v-if="words.who" class="who" :data-testid="`m29-who-${line.key}`">{{
          words.who
        }}</span>
      </span>
      <!-- Inside the line's button: a ring is read, never operated, so a tap on it opens the line. -->
      <ProgressRing
        v-if="!legs && line.progress !== null"
        :percent="line.progress * 100"
        :size="28"
        :label="line.source?.progressName"
      />
    </button>
    <button
      v-if="drawable"
      type="button"
      class="map"
      :aria-label="t('dayPlan.mapOf', { title: words.title })"
      :data-testid="`m29-map-${line.key}`"
      @click="mapOpen = true"
    >
      {{ t('dayPlan.openMap') }} ›
    </button>
    <button
      v-if="legs"
      type="button"
      class="expand"
      :aria-expanded="legsOpen ? 'true' : 'false'"
      :aria-label="t('dayPlan.showLegs', { title: words.title })"
      :data-testid="`m29-legs-toggle-${line.key}`"
      @click="legsOpen = !legsOpen"
    >
      <IonIcon :icon="chevronForward" aria-hidden="true" />
    </button>
    <!-- Only a task ticks here; an idea is made Gemacht where it is opened (M28). -->
    <IonCheckbox
      v-else-if="line.kind === DAY_LINE.task"
      class="tick"
      :checked="line.done === true"
      :aria-label="t('dayPlan.tick', { title: words.title })"
      :data-testid="`m29-tick-${line.key}`"
      @ionChange="emit('tick')"
    />
    <ConnectionLegs
      v-if="legs && legsOpen"
      class="legs"
      :legs="legs"
      :link="line.entry?.link"
      :data-testid="`m29-legs-${line.key}`"
    />
    <ConnectionMapView
      v-if="drawable && legs"
      :open="mapOpen"
      :legs="legs"
      :link="line.entry?.link"
      :title="words.title"
      @close="mapOpen = false"
    />
  </div>
</template>

<style scoped>
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
.line[data-kind='meal'] {
  border-left-color: var(--ct-alpenrose);
}
.map {
  flex: none;
  padding: 4px 2px;
  border: none;
  background: none;
  color: var(--jp-action);
  font: inherit;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.line[data-kind='connection'] {
  flex-wrap: wrap;
  border-left-color: var(--ct-glacier);
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

/* As wide as its widest word, „ganztags", so every title starts on one line. */
.time {
  flex: 0 0 56px;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}
.time.word {
  color: var(--ct-subtext0);
}

.body {
  display: flex;
  flex: 1;
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

/* FR-29.15: whom the line is for — a shade above its detail, so a name reads first. */
.who {
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

/* M25's checkbox, its padding the tap target around the box. */
.tick {
  flex: none;
  margin-inline-end: -10px;
  padding: 10px;
}

.expand {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--ct-subtext0);
  cursor: pointer;
}

.expand ion-icon {
  font-size: var(--jp-icon-sm);
  transition: transform 0.15s;
}

.expand[aria-expanded='true'] ion-icon {
  transform: rotate(90deg);
}

/* A connection's legs, opened under its line. */
.legs {
  flex: 1 0 100%;
  padding: 0 4px 10px 14px;
}
</style>
