<script setup lang="ts">
/**
 * A map with tracks on it (FR-29.17, ADR-085): Leaflet over swisstopo's
 * Landeskarte or OpenStreetMap, loaded with the first map that needs it.
 * Where the instance draws no tiles, or the device is offline, the same
 * lines are drawn alone (`TrackLines`), so a map never waits on a network.
 *
 * Still in the card, where a tap opens the full-screen map; interactive
 * there, where a tap on a line chooses its track.
 */
import type * as Leaflet from 'leaflet'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import './trackMap.css'

import { t } from '@/i18n'
import type { MapSource } from '@/domain/track'
import { useTileState } from '@/lib/mapTiles'
import { directionArrows, loadLeaflet, tileLayer } from './mapLayers'
import TrackLines from './TrackLines.vue'
import type { MapLine, MapMark } from './trackColors'

const props = withDefaults(
  defineProps<{
    lines: MapLine[]
    source: MapSource
    /** Pans, zooms and chooses by tapping a line; otherwise a still picture. */
    interactive?: boolean
    /** People on the map (FR-29.19), over the lines and outside the frame. */
    marks?: MapMark[]
    /** Frames every line, not only the chosen ones — a route with the ways to it (FR-29.18). */
    frameAll?: boolean
    /** Stops along the lines, drawn as small dots. */
    dots?: [number, number][]
  }>(),
  { interactive: false, marks: () => [], frameAll: false, dots: () => [] },
)

const emit = defineEmits<{ choose: [id: string] }>()

/** Room around the chosen track when the map frames it, in pixels. */
const FIT_PADDING = { still: 16, interactive: 40 }

const tiles = useTileState()
const host = ref<HTMLElement | null>(null)
const map = shallowRef<Leaflet.Map | null>(null)
let leaflet: typeof Leaflet | null = null
let layer: Leaflet.TileLayer | null = null
let drawn: Leaflet.LayerGroup | null = null
let people: Leaflet.LayerGroup | null = null
let resize: ResizeObserver | null = null
/** Whether the map has been framed since it had a size. */
let framed = false

const chosen = computed(() => props.lines.find((line) => line.chosen) ?? props.lines[0] ?? null)
/**
 * Every chosen line, in order: one track, or a connection's legs — one
 * journey in several lines (FR-29.18), whose ends are the whole's.
 */
const chosenLines = computed(() => {
  const all = props.lines.filter((line) => line.chosen)
  return all.length > 0 ? all : chosen.value ? [chosen.value] : []
})

async function mount(): Promise<void> {
  if (!host.value || map.value) return
  leaflet ??= await loadLeaflet()
  if (!host.value || map.value || tiles.value !== 'on') return
  const still = !props.interactive
  map.value = leaflet.map(host.value, {
    zoomControl: false,
    zoomSnap: 0.25,
    dragging: !still,
    touchZoom: !still,
    doubleClickZoom: !still,
    scrollWheelZoom: !still,
    boxZoom: !still,
    keyboard: !still,
  })
  map.value.attributionControl.setPrefix(false)
  setSource(props.source)
  draw()
  drawMarks()
  // The map's box is often still growing when it mounts — a sheet sliding
  // up, a modal opening — and Leaflet measures once. Re-measure on every
  // change of size, and frame the track the first time there is one.
  resize = new ResizeObserver(() => {
    if (!map.value || !host.value || host.value.clientHeight === 0) return
    map.value.invalidateSize()
    if (!framed) fit()
  })
  resize.observe(host.value)
}

function unmount(): void {
  resize?.disconnect()
  resize = null
  map.value?.remove()
  map.value = null
  layer = null
  drawn = null
  people = null
  framed = false
}

function setSource(source: MapSource): void {
  if (!map.value || !leaflet) return
  if (layer) map.value.removeLayer(layer)
  layer = tileLayer(leaflet, source).addTo(map.value)
  layer.bringToBack()
}

function draw(): void {
  if (!map.value || !leaflet) return
  drawn?.remove()
  const L = leaflet
  const group = L.layerGroup()
  const ordered = [...props.lines].sort((a, b) => Number(a.chosen) - Number(b.chosen))
  for (const line of ordered) {
    const other = line.chosen ? '' : ' other'
    L.polyline(line.points, { className: `jp-track-halo${other}`, interactive: false }).addTo(group)
    const path = L.polyline(line.points, {
      className: `jp-track-line ${line.hueClass}${other}`,
      interactive: props.interactive,
    }).addTo(group)
    if (props.interactive) path.on('click', () => emit('choose', line.id))
  }
  for (const dot of props.dots) {
    L.circleMarker(dot, { className: 'jp-stop', radius: 3, interactive: false }).addTo(group)
  }
  const points = chosenLines.value.flatMap((line) => line.points)
  // Which way the chosen track is walked (FR-29.20); a journey's legs say it by their order.
  if (chosenLines.value.length === 1) directionArrows(L, map.value, () => points).addTo(group)
  if (points.length > 0) {
    L.circleMarker(points[0]!, {
      className: 'jp-track-start',
      radius: 5,
      interactive: false,
    }).addTo(group)
    L.circleMarker(points[points.length - 1]!, {
      className: 'jp-track-finish',
      radius: 5,
      interactive: false,
    }).addTo(group)
  }
  drawn = group.addTo(map.value)
}

/**
 * People's marks, on a layer of their own so a position arriving every few
 * seconds redraws two markers rather than every line. The text goes in as
 * text — a name is somebody's input.
 */
function drawMarks(): void {
  if (!map.value || !leaflet) return
  people?.remove()
  const L = leaflet
  const group = L.layerGroup()
  for (const mark of props.marks) {
    const at: [number, number] = [mark.lat, mark.lon]
    if (mark.kind === 'me') {
      L.circle(at, {
        radius: mark.accuracyM,
        className: 'jp-me-accuracy',
        interactive: false,
      }).addTo(group)
      L.circleMarker(at, { radius: 7, className: 'jp-me', interactive: false })
        .bindTooltip(mark.title)
        .addTo(group)
      continue
    }
    const badge = document.createElement('span')
    badge.className = 'jp-person-badge'
    badge.textContent = mark.initials
    badge.title = mark.title
    badge.dataset['testid'] = 'map-mark-person'
    L.marker(at, {
      icon: L.divIcon({ html: badge, className: 'jp-person-mark', iconSize: [28, 28] }),
      title: mark.title,
      keyboard: false,
    }).addTo(group)
  }
  people = group.addTo(map.value)
}

/** Moves the map to a point without changing its zoom — the 📍's answer. */
function focus(lat: number, lon: number): void {
  map.value?.panTo([lat, lon])
}

/** Frames the chosen track — and the button in the full-screen map does the same. */
function fit(): void {
  const points = props.frameAll
    ? props.lines.flatMap((line) => line.points)
    : chosenLines.value.flatMap((line) => line.points)
  if (!map.value || !leaflet || points.length === 0 || !host.value?.clientHeight) return
  const padding = props.interactive ? FIT_PADDING.interactive : FIT_PADDING.still
  map.value.fitBounds(leaflet.latLngBounds(points), { padding: [padding, padding] })
  framed = true
}

defineExpose({ fit, focus })

watch(
  [tiles, host],
  ([state, element]) => {
    if (state === 'on' && element) void mount()
    else unmount()
  },
  { immediate: true },
)
watch(
  () => props.marks,
  () => drawMarks(),
)
watch(
  () => props.source,
  (source) => setSource(source),
)
watch(
  () => props.lines,
  (next, previous) => {
    draw()
    // A different track chosen is a different frame; a changed setting is not.
    if (next.find((line) => line.chosen)?.id !== previous?.find((line) => line.chosen)?.id) fit()
  },
)

onBeforeUnmount(unmount)
</script>

<template>
  <div class="track-map" :data-tiles="tiles" :data-source="source">
    <div v-if="tiles === 'on'" ref="host" class="leaflet-host" />
    <div v-else class="lines-only">
      <TrackLines :lines="lines" :marks="marks" :frame-all="frameAll" :dots="dots" />
      <span v-if="tiles === 'offline'" class="note" data-testid="track-map-offline">
        {{ t('track.offline') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.track-map {
  position: relative;
  overflow: hidden;
  background: var(--jp-surface-sunken);
}

.leaflet-host,
.lines-only {
  position: absolute;
  inset: 0;
}

/* The faint grid a line without a map stands on — the sunken plane, ruled. */
.lines-only {
  background-image:
    linear-gradient(var(--jp-surface-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--jp-surface-border) 1px, transparent 1px);
  background-size: 24px 24px;
  padding: 12px;
}

.note {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
}
</style>
