<script setup lang="ts">
/**
 * One line of the day plan's timeline (FR-29.15): its time, its kind with a
 * coloured edge, its title and second line, and — by kind — an excursion's
 * packed ring or a tick, or for an entry carrying a connection its legs
 * opened in place and its map (FR-29.18). Today's card and tomorrow's render
 * the same row.
 */
import { IonIcon } from '@ionic/vue'
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
import { dayLineWords } from './dayLineText'
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
      <!-- FR-33.5: an untimed meal says its slot where another line says nothing. -->
      <span class="time jp-num" :class="{ word: !line.time && !!line.source?.timeWord }">{{
        line.time ?? line.source?.timeWord ?? t('dayPlan.noTime')
      }}</span>
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
    <ProgressRing v-else-if="line.progress !== null" :percent="line.progress * 100" :size="28" />
    <button
      v-else-if="line.done !== null"
      type="button"
      class="tick"
      :aria-pressed="line.done ? 'true' : 'false'"
      :aria-label="t('dayPlan.tick', { title: words.title })"
      :data-testid="`m29-tick-${line.key}`"
      @click="emit('tick')"
    >
      <span aria-hidden="true">{{ line.done ? '✓' : '' }}</span>
    </button>
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

.time {
  flex: 0 0 44px;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}
.time.word {
  color: var(--ct-subtext0);
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

/* FR-29.15: whom the line is for — a shade above its detail, so a name reads first. */
.who {
  color: var(--ct-subtext1);
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

.tick[aria-pressed='true'] {
  border-color: var(--jp-done);
  background: var(--jp-done);
}
</style>
