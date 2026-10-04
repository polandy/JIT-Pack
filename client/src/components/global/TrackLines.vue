<script setup lang="ts">
/**
 * Tracks as lines alone, without a map under them (FR-29.17): the board
 * card's banner, and every map while the device is offline or the instance
 * draws no tiles. Web Mercator like the tiles, so a line looks the same on
 * both; framed on the chosen track, or on all of them.
 */
import { computed } from 'vue'

import type { MapLine, MapMark } from './trackColors'

const props = withDefaults(
  defineProps<{
    lines: MapLine[]
    /** Frame every line rather than the chosen one. */
    frameAll?: boolean
    /** Dots at the chosen line's start and end. */
    ends?: boolean
    /** People on the map (FR-29.19), drawn where they fall inside the frame. */
    marks?: MapMark[]
    /** Stops along the lines, drawn as small dots. */
    dots?: [number, number][]
  }>(),
  { frameAll: false, ends: true, marks: () => [], dots: () => [] },
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
  // Several chosen lines are one journey — a connection's legs: its ends are the whole's.
  const chosenLines = props.lines.filter((line) => line.chosen)
  const firstLine = chosenLines[0] ?? chosen
  const lastLine = chosenLines[chosenLines.length - 1] ?? chosen
  const first = firstLine?.points[0]
  const last = lastLine?.points[lastLine.points.length - 1]
  return {
    viewBox: `${x0 - pad} ${y0 - pad} ${width + 2 * pad} ${height + 2 * pad}`,
    paths: ordered.map((line) => ({ ...line, d: path(line.points) })),
    start: props.ends ? end(first) : null,
    finish: props.ends ? end(last) : null,
    dots: props.dots.map((dot) => end(dot)!),
    marks: props.marks.map((mark) => ({ ...mark, d: end([mark.lat, mark.lon])! })),
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
    <g
      v-for="line in drawn.paths"
      :key="line.id"
      :class="{ other: !line.chosen }"
      data-testid="map-line"
    >
      <path class="halo" :d="line.d" />
      <path class="line" :class="line.hueClass" :d="line.d" />
    </g>
    <path v-for="(dot, index) in drawn.dots" :key="`dot-${index}`" class="dot" :d="dot" />
    <path v-if="drawn.start" class="end start" :d="drawn.start" />
    <path v-if="drawn.finish" class="end finish" :d="drawn.finish" />
    <path
      v-for="mark in drawn.marks"
      :key="mark.id"
      class="mark"
      :class="mark.kind"
      :d="mark.d"
      :data-testid="`map-mark-${mark.kind}`"
    />
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

.mark {
  stroke-width: 14px;
}

.mark.me {
  stroke: var(--ct-glacier);
}

.mark.person {
  stroke: var(--ct-heather);
}

.dot {
  stroke: var(--ct-text);
  stroke-width: 6px;
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
  stroke-dasharray: 1 6;
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
