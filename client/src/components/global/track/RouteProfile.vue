<script setup lang="ts">
/**
 * The height profile of a route being edited (FR-29.20): height over
 * distance, the changed stretches in their own colour, a faint mark where
 * each handle lies. A finger moved over it names the distance and height
 * there and hands the place up, so the map can show it.
 */
import { computed, ref } from 'vue'

import { haversine } from '@/domain/shared/track'
import type { DrawnPoint, LatLon } from '@/domain/shared/route'
import { t } from '@/i18n'
import { formatDistance, formatMetres } from '@/lib/trackFormat'

const props = defineProps<{
  points: DrawnPoint[]
  /** How far along the route each inner handle lies, in metres. */
  handleDistances: number[]
  hueClass: string
  changedHueClass: string
}>()

const emit = defineEmits<{ scrub: [place: LatLon | null] }>()

const WIDTH = 360
const HEIGHT = 92
const TOP = 18
const BOTTOM = 6
/** A profile flatter than this many metres is drawn this tall, so a lakeside walk is not a cliff. */
const MIN_SPAN_M = 50

const host = ref<SVGSVGElement | null>(null)
const at = ref<number | null>(null)

const shape = computed(() => {
  const along = [0]
  for (let i = 1; i < props.points.length; i++) {
    along.push(along[i - 1]! + haversine(props.points[i - 1]!, props.points[i]!))
  }
  const total = along[along.length - 1] ?? 0
  const heights = props.points.flatMap((p) => (p.ele === null ? [] : [p.ele]))
  if (total < 1 || heights.length < 2) return null
  let low = Math.min(...heights)
  let high = Math.max(...heights)
  if (high - low < MIN_SPAN_M) {
    const middle = (high + low) / 2
    low = middle - MIN_SPAN_M / 2
    high = middle + MIN_SPAN_M / 2
  }
  const x = (m: number) => (m / total) * WIDTH
  const y = (e: number) => TOP + (1 - (e - low) / (high - low)) * (HEIGHT - TOP - BOTTOM)
  let line = ''
  let changed = ''
  let first: number | null = null
  let last = 0
  props.points.forEach((p, i) => {
    if (p.ele === null) return
    const here = `${x(along[i]!).toFixed(1)} ${y(p.ele).toFixed(1)}`
    line += `${first === null ? 'M' : 'L'}${here}`
    first ??= i
    last = i
    if (!p.changed) return
    const before = props.points[i - 1]
    if (before?.changed && before.ele !== null) changed += `L${here}`
    else if (before && before.ele !== null) {
      changed += `M${x(along[i - 1]!).toFixed(1)} ${y(before.ele).toFixed(1)}L${here}`
    } else changed += `M${here}`
  })
  const area = `${line}L${x(along[last]!).toFixed(1)} ${HEIGHT}L${x(along[first!]!).toFixed(1)} ${HEIGHT}Z`
  return {
    along,
    total,
    line,
    area,
    changed,
    high: formatMetres(high),
    low: formatMetres(low),
    ticks: props.handleDistances.map((m) => x(m)),
  }
})

const reading = computed(() => {
  const s = shape.value
  if (!s || at.value === null) return null
  const metres = (at.value / WIDTH) * s.total
  let index = 0
  while (index < s.along.length - 1 && s.along[index]! < metres) index++
  const point = props.points[index]!
  return {
    x: at.value,
    point,
    label:
      point.ele === null
        ? formatDistance(s.along[index]!)
        : `${formatDistance(s.along[index]!)} · ${formatMetres(point.ele)}`,
  }
})

function move(event: PointerEvent) {
  const box = host.value?.getBoundingClientRect()
  if (!box || box.width === 0) return
  at.value = Math.max(0, Math.min(WIDTH, ((event.clientX - box.left) / box.width) * WIDTH))
  const point = reading.value?.point
  emit('scrub', point ? { lat: point.lat, lon: point.lon } : null)
}

function leave() {
  at.value = null
  emit('scrub', null)
}
</script>

<template>
  <div class="route-profile" data-testid="route-profile">
    <svg
      v-if="shape"
      ref="host"
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      preserveAspectRatio="none"
      @pointerdown="move"
      @pointermove="move"
      @pointerup="leave"
      @pointerleave="leave"
    >
      <path
        v-for="(tick, i) in shape.ticks"
        :key="i"
        class="tick"
        :d="`M${tick.toFixed(1)} ${TOP - 4}V${HEIGHT}`"
      />
      <path class="area" :class="hueClass" :d="shape.area" />
      <path class="line" :class="hueClass" :d="shape.line" />
      <path v-if="shape.changed" class="line changed" :class="changedHueClass" :d="shape.changed" />
      <line
        v-if="reading"
        class="cursor"
        :x1="reading.x"
        :x2="reading.x"
        :y1="TOP - 4"
        :y2="HEIGHT"
      />
    </svg>
    <p v-else class="empty">
      {{ points.length > 1 ? t('routeEdit.noHeights') : t('routeEdit.profileLater') }}
    </p>
    <template v-if="shape">
      <span class="scale top jp-num">{{ shape.high }}</span>
      <span class="scale bottom jp-num">{{ shape.low }}</span>
    </template>
    <span
      v-if="reading"
      class="reading jp-num"
      data-testid="route-profile-reading"
      :style="{ left: `clamp(48px, ${(reading.x / WIDTH) * 100}%, calc(100% - 48px))` }"
    >
      {{ reading.label }}
    </span>
  </div>
</template>

<style scoped>
.route-profile {
  position: relative;
  height: 92px;
  touch-action: none;
}

svg {
  display: block;
  width: 100%;
  height: 100%;
  cursor: ew-resize;
}

.tick {
  stroke: var(--ct-surface1);
  stroke-dasharray: 2 3;
  vector-effect: non-scaling-stroke;
}

.area {
  stroke: none;
  opacity: 0.22;
}

.line {
  fill: none;
  stroke-width: 2px;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.line.changed {
  stroke-width: 2.5px;
}

.cursor {
  stroke: var(--ct-text);
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}

.jp-track-larch {
  stroke: var(--ct-larch);
  fill: var(--ct-larch);
}

.jp-track-glacier {
  stroke: var(--ct-glacier);
  fill: var(--ct-glacier);
}

.jp-track-heather {
  stroke: var(--ct-heather);
  fill: var(--ct-heather);
}

.jp-track-alpenrose {
  stroke: var(--ct-alpenrose);
  fill: var(--ct-alpenrose);
}

.jp-track-pine {
  stroke: var(--ct-pine);
  fill: var(--ct-pine);
}

.line.jp-track-larch,
.line.jp-track-glacier,
.line.jp-track-heather,
.line.jp-track-alpenrose,
.line.jp-track-pine {
  fill: none;
}

.scale {
  position: absolute;
  left: 4px;
  padding: 0 3px;
  border-radius: var(--jp-r-xs);
  background: color-mix(in srgb, var(--jp-surface-page) 75%, transparent);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
  pointer-events: none;
}

.scale.top {
  top: 0;
}

.scale.bottom {
  bottom: 2px;
}

.reading {
  position: absolute;
  top: 0;
  padding: 1px 6px;
  border-radius: var(--jp-r-xs);
  background: var(--ct-text);
  color: var(--ct-base);
  font-size: var(--jp-text-2xs);
  white-space: nowrap;
  transform: translateX(-50%);
  pointer-events: none;
}

.empty {
  display: grid;
  place-items: center;
  height: 100%;
  margin: 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}
</style>
