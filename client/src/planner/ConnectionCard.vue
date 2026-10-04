<script setup lang="ts">
/**
 * The connection an entry carries, in its sheet (FR-29.18): its times and
 * how long it takes, its stops and lines, the small map where its stops are
 * known, and its legs a tap away. *Ändern* and *Entfernen* belong to the
 * entry's form; read-only, the card is the preview of a read link.
 */
import { IonIcon } from '@ionic/vue'
import { expandOutline, trainOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import TrackMap from '@/components/global/TrackMap.vue'
import { defaultSource } from '@/domain/track'
import { t } from '@/i18n'
import type { ConnectionLeg } from '@/types/domain'
import ConnectionLegs from './ConnectionLegs.vue'
import ConnectionMapView from './ConnectionMapView.vue'
import { connectionLines, connectionStops, legHue } from './connectionMap'
import {
  connectionMinutes,
  connectionSummary,
  connectionTitle,
  hasMap,
  timeOf,
} from './domain/connections'
import { journeyDuration } from './journeyText'

const props = defineProps<{
  legs: readonly ConnectionLeg[]
  link?: string | null
  /** What the full map is headed by: the entry's title. */
  title: string
  /** The preview of a read link: no change, no removal. */
  readonly?: boolean
}>()

const emit = defineEmits<{ change: []; remove: [] }>()

const legsOpen = ref(false)
const mapOpen = ref(false)

const summary = computed(() => connectionSummary(props.legs))
const times = computed(() => `${timeOf(props.legs[0]!.dep)} → ${summary.value.arrival}`)
const detail = computed(() =>
  [
    journeyDuration(connectionMinutes(props.legs)),
    summary.value.transfers > 0
      ? t('dayPlan.transfers', { n: summary.value.transfers })
      : t('dayPlan.direct'),
  ].join(' · '),
)
const lines = computed(() =>
  props.legs.filter((leg) => leg.line !== '').map((leg) => ({ name: leg.line, hue: legHue(leg) })),
)
const drawable = computed(() => hasMap(props.legs))
const mapLines = computed(() => connectionLines(props.legs))
const dots = computed(() => connectionStops(props.legs))
const source = computed(() => defaultSource(mapLines.value.map((line) => line.points)))
</script>

<template>
  <section class="card" data-testid="day-entry-connection">
    <div class="head">
      <span class="times jp-num">{{ times }}</span>
      <span class="detail jp-num">{{ detail }}</span>
    </div>
    <p class="route">
      <IonIcon :icon="trainOutline" aria-hidden="true" />
      {{ connectionTitle(legs) }}
      <span v-for="(line, index) in lines" :key="index" class="line-chip" :data-hue="line.hue">{{
        line.name
      }}</span>
    </p>
    <button
      v-if="drawable"
      type="button"
      class="map"
      :aria-label="t('dayPlan.mapOf', { title })"
      data-testid="connection-map"
      @click="mapOpen = true"
    >
      <TrackMap class="still" :lines="mapLines" :dots="dots" :source="source" />
      <span class="open">
        <IonIcon :icon="expandOutline" aria-hidden="true" />
        {{ t('dayPlan.openMap') }}
      </span>
    </button>
    <ConnectionLegs
      v-if="legsOpen"
      class="legs"
      :legs="legs"
      :link="link"
      data-testid="day-entry-legs"
    />
    <div class="actions">
      <button
        type="button"
        :aria-expanded="legsOpen ? 'true' : 'false'"
        data-testid="day-entry-legs-toggle"
        @click="legsOpen = !legsOpen"
      >
        {{ t('dayPlan.legsToggle') }} {{ legsOpen ? '▴' : '▾' }}
      </button>
      <template v-if="!readonly">
        <button type="button" data-testid="day-entry-connection-change" @click="emit('change')">
          {{ t('dayPlan.changeConnection') }}
        </button>
        <button
          type="button"
          class="remove"
          data-testid="day-entry-connection-remove"
          @click="emit('remove')"
        >
          {{ t('dayPlan.removeConnection') }}
        </button>
      </template>
    </div>
    <ConnectionMapView
      v-if="drawable"
      :open="mapOpen"
      :legs="legs"
      :link="link"
      :title="title"
      @close="mapOpen = false"
    />
  </section>
</template>

<style scoped>
.card {
  padding: 10px 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.times {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}

.detail {
  margin-left: auto;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.route {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 2px 0 0;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.route ion-icon {
  font-size: var(--jp-icon-sm);
}

.line-chip {
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

.map {
  position: relative;
  display: block;
  width: 100%;
  height: 128px;
  margin-top: 8px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-sm);
  background: none;
  cursor: pointer;
}

.still {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.open {
  position: absolute;
  z-index: 500;
  right: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  box-shadow: var(--jp-shadow);
  color: var(--ct-text);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.legs {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--jp-surface-border);
}

.actions {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.actions button {
  padding: 0;
  border: none;
  background: none;
  color: var(--jp-action);
  font: inherit;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.actions .remove {
  margin-left: auto;
  color: var(--ct-subtext0);
  font-weight: var(--jp-weight-medium);
}
</style>
