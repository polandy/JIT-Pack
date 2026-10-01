<script setup lang="ts">
/**
 * Tracks as lines alone, without a map under them (FR-29.17): the board
 * card's banner, and every map while the device is offline or the instance
 * draws no tiles. Web Mercator like the tiles, so a line looks the same on
 * both; framed on the chosen track, or on all of them.
 */
import { computed } from 'vue'

import type { MapLine } from './trackColors'

const props = withDefaults(
  defineProps<{
    lines: MapLine[]
    /** Frame every line rather than the chosen one. */
    frameAll?: boolean
    /** Dots at the chosen line's start and end. */
    ends?: boolean
  }>(),
  { frameAll: false, ends: true },
)

const DEG = 180 / Math.PI

/** Web Mercator's y, in degrees, upside down for SVG. */
function y(lat: number): number {
  return -Math.log(Math.tan(Math.PI / 4 + lat / (2 * DEG))) * DEG
}

/** How much room the frame leaves around the lines, as a share of their extent. */
const MARGIN = 0.12

const drawn = computed(() => {
  // The chosen line last, so it is drawn over the others.
  const ordered = [...props.lines].sort((a, b) => Number(a.chosen) - Number(b.chosen))
  const framed = props.frameAll ? props.lines : props.lines.filter((line) => line.chosen)
  const frame = (framed.length > 0 ? framed : props.lines).flatMap((line) => line.points)
  if (frame.length === 0) return null
  const xs = frame.map(([, lon]) => lon)
  const ys = frame.map(([lat]) => y(lat))
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const width = Math.max(Math.max(...xs) - x0, 1e-4)
  const height = Math.max(Math.max(...ys) - y0, 1e-4)
  const pad = Math.max(width, height) * MARGIN
  const path = (points: [number, number][]) =>
    points.map(([lat, lon], i) => `${i ? 'L' : 'M'}${lon.toFixed(5)} ${y(lat).toFixed(5)}`).join('')
  const chosen = props.lines.find((line) => line.chosen) ?? null
  const end = (point: [number, number] | undefined) =>
    point ? `M${point[1].toFixed(5)} ${y(point[0]).toFixed(5)}h0` : null
  return {
    viewBox: `${x0 - pad} ${y0 - pad} ${width + 2 * pad} ${height + 2 * pad}`,
    paths: ordered.map((line) => ({ ...line, d: path(line.points) })),
    start: props.ends && chosen ? end(chosen.points[0]) : null,
    finish: props.ends && chosen ? end(chosen.points[chosen.points.length - 1]) : null,
  }
})
</script>

<template>
  <svg
    v-if="drawn"
    class="track-lines"
    :viewBox="drawn.viewBox"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <g v-for="line in drawn.paths" :key="line.id" :class="{ other: !line.chosen }">
      <path class="halo" :d="line.d" />
      <path class="line" :class="line.hueClass" :d="line.d" />
    </g>
    <path v-if="drawn.start" class="end start" :d="drawn.start" />
    <path v-if="drawn.finish" class="end finish" :d="drawn.finish" />
  </svg>
</template>

<style scoped>
.track-lines {
  display: block;
  width: 100%;
  height: 100%;
}

path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.halo {
  stroke: color-mix(in srgb, var(--ct-crust) 60%, transparent);
  stroke-width: 6px;
}

.line {
  stroke-width: 3.5px;
}

.other {
  opacity: 0.55;
}

.other .line {
  stroke-width: 2.5px;
}

.end {
  stroke-width: 11px;
}

.start {
  stroke: var(--ct-pine);
}

.finish {
  stroke: var(--ct-ember);
}

.jp-track-larch {
  stroke: var(--ct-larch);
}

.jp-track-glacier {
  stroke: var(--ct-glacier);
}

.jp-track-heather {
  stroke: var(--ct-heather);
}

.jp-track-alpenrose {
  stroke: var(--ct-alpenrose);
}

.jp-track-pine {
  stroke: var(--ct-pine);
}
</style>
