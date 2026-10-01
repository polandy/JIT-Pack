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

import { t } from '@/i18n'
import type { MapSource } from '@/domain/track'
import { useTileState } from '@/lib/mapTiles'
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
  }>(),
  { interactive: false, marks: () => [] },
)

const emit = defineEmits<{ choose: [id: string] }>()

/** Where each source's tiles come from, and what its licence asks to be said. */
const TILES: Record<MapSource, { url: string; attribution: string; maxZoom: number }> = {
  swisstopo: {
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    attribution:
      '© <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noopener">swisstopo</a>',
    maxZoom: 18,
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxZoom: 19,
  },
}

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

async function mount(): Promise<void> {
  if (!host.value || map.value) return
  leaflet ??= await import('leaflet')
  await import('leaflet/dist/leaflet.css')
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
  const spec = TILES[source]
  layer = leaflet
    // A phone's screen has two or three pixels to a point: a tile from one
    // zoom further, drawn half the size, keeps a map's lettering sharp.
    .tileLayer(spec.url, {
      maxZoom: spec.maxZoom,
      attribution: spec.attribution,
      detectRetina: true,
    })
    .addTo(map.value)
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
  const points = chosen.value?.points ?? []
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
  const points = chosen.value?.points ?? []
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
      <TrackLines :lines="lines" :marks="marks" />
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

<style>
/* Leaflet's own elements are created outside this component's scope. Its
   stylesheet brings colours of its own; what shows on a track map is put
   back on the tokens here (ADR-085). */
.track-map .leaflet-container {
  background: var(--jp-surface-sunken);
  font: inherit;
}

/* At a fractional zoom Chrome leaves a hairline between two tiles; a
   transparent outline closes it. */
.track-map .leaflet-tile {
  outline: 1px solid transparent;
}

.track-map .leaflet-control-attribution {
  background: color-mix(in srgb, var(--jp-surface-card) 80%, transparent);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
}

.track-map .leaflet-control-attribution a {
  color: var(--jp-action);
}

.track-map .jp-track-halo {
  fill: none;
  stroke: color-mix(in srgb, var(--ct-crust) 50%, transparent);
  stroke-width: 7px;
}

.track-map .jp-track-line {
  fill: none;
  stroke-width: 4px;
}

.track-map .other {
  opacity: 0.7;
}

.track-map .jp-track-line.other {
  stroke-width: 3px;
}

.track-map .jp-track-start,
.track-map .jp-track-finish {
  stroke: var(--ct-base);
  stroke-width: 2px;
  fill-opacity: 1;
}

.track-map .jp-track-start {
  fill: var(--ct-pine);
}

.track-map .jp-track-finish {
  fill: var(--ct-ember);
}

.track-map .jp-me {
  stroke: var(--ct-base);
  stroke-width: 3px;
  fill: var(--ct-glacier);
  fill-opacity: 1;
}

.track-map .jp-me-accuracy {
  stroke: var(--ct-glacier);
  stroke-width: 1px;
  fill: var(--ct-glacier);
  fill-opacity: 0.15;
}

.track-map .jp-person-mark {
  background: none;
  border: 0;
}

.track-map .jp-person-badge {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 2px solid var(--ct-base);
  border-radius: 50%;
  background: var(--ct-heather);
  color: var(--ct-crust);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.track-map .jp-track-larch {
  stroke: var(--ct-larch);
}

.track-map .jp-track-glacier {
  stroke: var(--ct-glacier);
}

.track-map .jp-track-heather {
  stroke: var(--ct-heather);
}

.track-map .jp-track-alpenrose {
  stroke: var(--ct-alpenrose);
}

.track-map .jp-track-pine {
  stroke: var(--ct-pine);
}
</style>
