<script setup lang="ts">
/**
 * One line of the day plan's timeline (FR-29.15): its time, its kind with a
 * coloured edge, its title and second line, and — by kind — an excursion's
 * packed ring or a tick. Today's card and tomorrow's render the same row.
 */
import { IonIcon } from '@ionic/vue'
import {
  bulbOutline,
  carOutline,
  checkboxOutline,
  createOutline,
  trailSignOutline,
} from 'ionicons/icons'
import { computed } from 'vue'

import ProgressRing from '@/components/global/ProgressRing.vue'
import { t } from '@/i18n'
import type { NameOf } from '@/lib/rowFacts'
import { dayLineWords } from './dayLineText'
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
}

const words = computed(() => dayLineWords(props.line, props.nameOf))
</script>

<template>
  <div
    class="line"
    :data-kind="line.kind"
    :data-done="line.done ? 'true' : undefined"
    :data-testid="`m29-line-${line.key}`"
  >
    <button type="button" class="open" @click="emit('open')">
      <span class="time jp-num">{{ line.time ?? t('dayPlan.noTime') }}</span>
      <span class="body">
        <span class="kind">
          <IonIcon :icon="KIND_ICON[line.kind]" aria-hidden="true" />
          {{ words.kind }}
        </span>
        <span class="title">{{ words.title }}</span>
        <span v-if="words.detail" class="detail">{{ words.detail }}</span>
      </span>
    </button>
    <ProgressRing v-if="line.progress !== null" :percent="line.progress * 100" :size="28" />
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
</style>
