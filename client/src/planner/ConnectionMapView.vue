<script setup lang="ts">
/**
 * A connection on the whole screen (FR-29.18): its legs drawn on FR-29.17's
 * map, each in what it travels by, with a legend, the device's position
 * where it is known, and the legs listed beneath. Opened from the
 * connection's card in the entry's sheet and from its line in the day plan.
 */
import { IonIcon, IonModal } from '@ionic/vue'
import { chevronBack, locateOutline } from 'ionicons/icons'
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'

import TrackMap from '@/components/global/TrackMap.vue'
import { LEG_HUE_CLASS, type MapMark } from '@/lib/trackColors'
import { LIVE_LOCATION } from '@/composables/shared/useLiveLocation'
import { defaultSource } from '@/domain/track'
import { t } from '@/i18n'
import type { ConnectionLeg } from '@/types/domain'
import ConnectionLegs from './ConnectionLegs.vue'
import { connectionLines, connectionStops, legendHues } from './connectionMap'
import { connectionMinutes, connectionSummary, timeOf } from './domain/connections'
import { journeyDuration } from './journeyText'

const props = defineProps<{
  open: boolean
  legs: readonly ConnectionLeg[]
  title: string
  link?: string | null
}>()

const emit = defineEmits<{ close: [] }>()

const live = inject(LIVE_LOCATION, null)
const map = ref<InstanceType<typeof TrackMap> | null>(null)

const lines = computed(() => connectionLines(props.legs))
const dots = computed(() => connectionStops(props.legs))
const source = computed(() => defaultSource(lines.value.map((line) => line.points)))
const legend = computed(() =>
  legendHues(props.legs).map((hue) => ({ hue, hueClass: LEG_HUE_CLASS[hue] })),
)

const marks = computed<MapMark[]>(() => {
  const me = live?.me.value
  return me
    ? [
        {
          id: 'me',
          kind: 'me',
          lat: me.lat,
          lon: me.lon,
          accuracyM: me.accuracyM,
          initials: '',
          title: t('map.you'),
        },
      ]
    : []
})

const head = computed(() => {
  const legs = props.legs
  if (legs.length === 0) return null
  const summary = connectionSummary(legs)
  return {
    times: `${timeOf(legs[0]!.dep)} → ${summary.arrival}`,
    detail: [
      journeyDuration(connectionMinutes(legs)),
      summary.transfers > 0
        ? t('dayPlan.transfers', { n: summary.transfers })
        : t('dayPlan.direct'),
    ].join(' · '),
  }
})

// The position follows the device while the map is open, as on a track's map (FR-29.19).
watch(
  () => props.open,
  (open, was) => {
    if (open) live?.hold()
    else if (was) live?.release()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (props.open) live?.release()
})

/** ◎: asks where the device is, and goes there once it is known. */
function toMe() {
  live?.locate()
  const me = live?.me.value
  if (me) map.value?.focus(me.lat, me.lon)
}
</script>

<template>
  <IonModal
    :is-open="open"
    class="connection-map-view"
    data-testid="connection-map-full"
    @did-dismiss="emit('close')"
  >
    <div class="view">
      <div class="stage">
        <TrackMap
          ref="map"
          class="map"
          :lines="lines"
          :dots="dots"
          :marks="marks"
          :source="source"
          interactive
        />
        <div class="bar">
          <button
            type="button"
            class="back"
            :aria-label="t('dayPlan.back')"
            data-testid="connection-map-back"
            @click="emit('close')"
          >
            <IonIcon :icon="chevronBack" aria-hidden="true" />
          </button>
          <span class="title">{{ title }}</span>
        </div>
        <ul class="legend" data-testid="connection-map-legend">
          <li v-for="item in legend" :key="item.hue">
            <svg viewBox="0 0 20 6" aria-hidden="true">
              <path :class="item.hueClass" d="M2 3H18" />
            </svg>
            {{ t(`map.${item.hue}`) }}
          </li>
        </ul>
        <button
          v-if="live && live.state.value !== 'unavailable'"
          type="button"
          class="me"
          :aria-label="t('map.toMe')"
          data-testid="connection-map-me"
          @click="toMe"
        >
          <IonIcon :icon="locateOutline" aria-hidden="true" />
        </button>
      </div>
      <section v-if="head" class="card">
        <div class="head">
          <span class="times jp-num">{{ head.times }}</span>
          <span class="detail">{{ head.detail }}</span>
        </div>
        <ConnectionLegs :legs="legs" :link="link" data-testid="connection-map-legs" />
      </section>
    </div>
  </IonModal>
</template>

<style scoped>
.connection-map-view {
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
  --background: var(--ct-crust);
}

.view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--ct-crust);
  color: var(--ct-text);
}

.stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.map {
  position: absolute;
  inset: 0;
}

.bar {
  position: absolute;
  z-index: 500;
  top: calc(env(safe-area-inset-top, 0px) + 10px);
  left: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.back,
.me {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--jp-surface-card);
  box-shadow: var(--jp-shadow);
  color: var(--ct-text);
  cursor: pointer;
}

.back ion-icon,
.me ion-icon {
  font-size: var(--jp-icon-md);
}

.me {
  position: absolute;
  z-index: 500;
  right: 12px;
  bottom: 12px;
  color: var(--jp-action);
}

.title {
  min-width: 0;
  overflow: hidden;
  padding: 9px 14px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  box-shadow: var(--jp-shadow);
  font-weight: var(--jp-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend {
  position: absolute;
  z-index: 500;
  left: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 7px 10px;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-card);
  box-shadow: var(--jp-shadow);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
  list-style: none;
}

.legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend svg {
  width: 20px;
  height: 6px;
}

.legend path {
  fill: none;
  stroke-width: 4px;
  stroke-linecap: round;
}

.jp-leg-train {
  stroke: var(--ct-ember);
}

.jp-leg-bus {
  stroke: var(--ct-glacier);
}

.jp-leg-boat {
  stroke: var(--ct-heather);
}

.jp-leg-walk {
  stroke: var(--ct-subtext1);
  stroke-dasharray: 1 5;
}

.card {
  padding: 12px 16px 18px;
  border-radius: var(--jp-r-lg) var(--jp-r-lg) 0 0;
  background: var(--jp-surface-card);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
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
</style>
