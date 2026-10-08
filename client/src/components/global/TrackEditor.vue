<script setup lang="ts">
/**
 * Editing a track's route, or drawing one (FR-29.20, ADR-088), the way the
 * swisstopo app plans one: a tap on the map adds a point and the way there
 * follows the paths, a point is dragged and its two stretches follow, a
 * tap on the line sets a point there — asking which pass where the route
 * runs twice — and a tap on a point starts or ends the route there or
 * removes it. The figures, the time and the height profile follow every
 * change; what differs from the file is drawn in its own colour, over the
 * file's line, dotted. Arrows show which way the route is walked.
 *
 * Kernel, beside the track card: it knows a route and its owner's tracks
 * as lines, never what they hang on. Saving is handed up.
 */
import { IonIcon, IonModal } from '@ionic/vue'
import {
  arrowRedoOutline,
  arrowUndoOutline,
  close,
  repeatOutline,
  scanOutline,
  swapVerticalOutline,
} from 'ionicons/icons'
import type * as Leaflet from 'leaflet'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

import { TRACK_KIND, type TrackKind } from '@/api/types'
import {
  append,
  closeLoop,
  draftFromPoints,
  emptyDraft,
  endAt,
  handleDistance,
  handlePlace,
  insertAt,
  isChanged,
  isLoop,
  isSettled,
  legPoints,
  moveHandle,
  passesAt,
  removeHandle,
  reverse,
  routeFigures,
  routeLine,
  startAt,
  stretchFrom,
  type LatLon,
  type Pass,
} from '@/domain/route'
import { defaultSource, movingMinutes, type MapSource } from '@/domain/track'
import { t } from '@/i18n'
import { confirmDestructive } from '@/composables/shared/confirm'
import { createRouteEditor, legMode, type RouteEditor } from '@/composables/routeEditor'
import { fetchPath, fetchStraight, useRoutingUrl } from '@/composables/routing'
import { presentToast } from '@/composables/shared/toast'
import { formatDistance, formatDuration, formatMetres } from '@/lib/trackFormat'
import type { EditedTrack, SavedRoute } from '@/lib/trackEdit'
import './trackMap.css'
import { directionArrows, loadLeaflet, tileLayer } from './mapLayers'
import RouteProfile from './RouteProfile.vue'
import { TRACK_HUES, trackHueClass, type MapLine } from '@/lib/trackColors'

const props = defineProps<{
  open: boolean
  /** What the tracks belong to. */
  title: string
  /** The track being edited, or null to draw a route from nothing. */
  original: EditedTrack | null
  /** The owner's other tracks, drawn faint underneath. */
  others: MapLine[]
  /** The colour class of the route being edited. */
  hueClass: string
  /** Whether one more track fits — *Als neuer Track* is offered only then. */
  canAddNew: boolean
}>()

const emit = defineEmits<{ close: []; save: [route: SavedRoute] }>()

/** A stretch this long, from a pass on, shows which way each pass runs. */
const PASS_PREVIEW_M = 160
/** Where a route drawn from nothing starts: Switzerland, whole. */
const OVERVIEW = { center: [46.8, 8.2] as [number, number], zoom: 8 }
const FIT_PADDING = 50
/** A difference in distance below this is not worth a figure, in metres. */
const DELTA_MIN_M = 100
const CHANGED_HUE = trackHueClass(TRACK_HUES.indexOf('alpenrose'))
const CHANGED_HUE_ALTERNATIVE = trackHueClass(TRACK_HUES.indexOf('heather'))
const HANDLE_SIZE = 30

const routing = useRoutingUrl()
const editor = shallowRef<RouteEditor | null>(null)
const draft = computed(() => editor.value?.draft.value ?? emptyDraft())
const kind = ref<TrackKind>(TRACK_KIND.hike)
const followPaths = ref(true)
const selected = ref<number | null>(null)
const passes = ref<Pass[] | null>(null)
const saving = ref(false)
const name = ref('')
const source = ref<MapSource>('swisstopo')

const host = ref<HTMLElement | null>(null)
const map = shallowRef<Leaflet.Map | null>(null)
let L: typeof Leaflet | null = null
let drawn: Leaflet.LayerGroup | null = null
let preview: Leaflet.LayerGroup | null = null
let scrubMark: Leaflet.Marker | null = null
let rubber: Leaflet.Polyline | null = null
let tiles: Leaflet.TileLayer | null = null
let resize: ResizeObserver | null = null
let framed = false

/** Changed legs are alpenrose — heather where the route itself is alpenrose. Not blue: on the Landeskarte blue is water. */
const changedHue = computed(() =>
  props.hueClass === CHANGED_HUE ? CHANGED_HUE_ALTERNATIVE : CHANGED_HUE,
)
const mode = computed(() => legMode(followPaths.value, routing.value !== ''))
const line = computed(() => routeLine(draft.value))
const anyChanged = computed(() => draft.value.legs.some((_, i) => isChanged(draft.value, i)))
const settled = computed(() => isSettled(draft.value))
const figures = computed(() => routeFigures(draft.value))
const minutes = computed(() =>
  movingMinutes({
    kind: kind.value,
    with_kid: props.original?.withKid ?? false,
    distance_m: figures.value.distanceM,
    ascent_m: figures.value.ascentM,
    descent_m: figures.value.descentM,
  }),
)
const before = computed(() => {
  if (!props.original) return null
  const original = draftFromPoints(props.original.points)
  const f = routeFigures(original)
  return {
    figures: f,
    minutes: movingMinutes({
      kind: props.original.kind,
      with_kid: props.original.withKid,
      distance_m: f.distanceM,
      ascent_m: f.ascentM,
      descent_m: f.descentM,
    }),
  }
})
const canSave = computed(
  () =>
    draft.value.handles.length > 1 &&
    settled.value &&
    (props.original === null || editor.value?.edited.value === true),
)
const hint = computed(() => {
  const count = draft.value.handles.length
  if (count === 0) return t('routeEdit.hintStart')
  if (count === 1) return t(mode.value === 'path' ? 'routeEdit.hintNextPath' : 'routeEdit.hintNext')
  return t('routeEdit.hintMore')
})
const status = computed(() => {
  const parts: string[] = []
  if (!settled.value) parts.push(t('routeEdit.working'))
  if (routing.value === '') parts.push(t('routeEdit.routingOff'))
  else if (draft.value.legs.some((leg) => leg.mode === 'path') || mode.value === 'path') {
    parts.push(t('routeEdit.pathsBy'))
  }
  if (draft.value.legs.some((leg) => leg.mode === 'line')) parts.push(t('routeEdit.heightsBy'))
  return parts.join(' · ')
})
const delta = computed(() => {
  const b = before.value
  if (!b || !editor.value?.edited.value || draft.value.handles.length < 2) return null
  return {
    metres: figures.value.distanceM - b.figures.distanceM,
    minutes: minutes.value - b.minutes,
  }
})
const selectedAt = computed(() =>
  selected.value === null ? 0 : handleDistance(draft.value, selected.value),
)
const handleDistances = computed(() =>
  draft.value.handles.slice(1, -1).map((_, i) => handleDistance(draft.value, i + 1)),
)

function signed(value: number, text: string): string {
  return `${value < 0 ? '−' : '+'}${text}`
}

// --- the editor's life ---

function start() {
  const original = props.original
  kind.value = original?.kind ?? TRACK_KIND.hike
  followPaths.value = true
  selected.value = null
  passes.value = null
  saving.value = false
  editor.value?.dispose()
  editor.value = createRouteEditor({
    draft: original ? draftFromPoints(original.points) : emptyDraft(),
    kind: kind.value,
    fetchers: {
      path: (from, to, k, signal) => fetchPath(routing.value, from, to, k, signal),
      straight: (from, to, signal) => fetchStraight(from, to, signal),
    },
    onFallback: () => void presentToast({ message: t('routeEdit.noPath'), position: 'top' }),
  })
  const lines = original ? [original.points.map((p) => [p.lat, p.lon] as [number, number])] : []
  const all = [...lines, ...props.others.map((other) => other.points)]
  source.value = all.length > 0 ? defaultSource(all) : 'swisstopo'
}

function stop() {
  editor.value?.dispose()
  editor.value = null
  unmount()
}

watch(
  () => props.open,
  (open) => (open ? start() : stop()),
  { immediate: true },
)

function edit(change: Parameters<RouteEditor['edit']>[0]) {
  editor.value?.edit(change)
}

// --- the map ---

async function mount() {
  if (!host.value || map.value) return
  L = await loadLeaflet()
  if (!host.value || map.value) return
  map.value = L.map(host.value, { zoomControl: false, zoomSnap: 0.25, doubleClickZoom: false })
  map.value.attributionControl.setPrefix(false)
  tiles = tileLayer(L, source.value).addTo(map.value)
  for (const other of props.others) {
    L.polyline(other.points, {
      className: `jp-track-line other faint ${other.hueClass}`,
      interactive: false,
    }).addTo(map.value)
  }
  map.value.on('click', (event: Leaflet.LeafletMouseEvent) => {
    if (passes.value) return
    if (selected.value !== null) {
      selected.value = null
      return
    }
    edit((d) => append(d, { lat: event.latlng.lat, lon: event.latlng.lng }, mode.value))
  })
  resize = new ResizeObserver(() => {
    if (!map.value || !host.value || host.value.clientHeight === 0) return
    map.value.invalidateSize()
    if (!framed) frame()
  })
  resize.observe(host.value)
}

function unmount() {
  resize?.disconnect()
  resize = null
  map.value?.remove()
  map.value = null
  drawn = null
  preview = null
  scrubMark = null
  rubber = null
  tiles = null
  framed = false
}

function frame() {
  if (!map.value || !L || !host.value?.clientHeight) return
  const points = props.original
    ? props.original.points.map((p) => [p.lat, p.lon] as [number, number])
    : props.others.flatMap((other) => other.points)
  if (points.length > 0) {
    map.value.fitBounds(L.latLngBounds(points), { padding: [FIT_PADDING, FIT_PADDING] })
  } else map.value.setView(OVERVIEW.center, OVERVIEW.zoom)
  framed = true
  draw()
}

function fit() {
  if (!map.value || !L || line.value.length < 2) return
  map.value.fitBounds(L.latLngBounds(line.value.map((p) => [p.lat, p.lon])), {
    padding: [FIT_PADDING, FIT_PADDING],
  })
}

function setSource(next: MapSource) {
  source.value = next
  if (!map.value || !L) return
  if (tiles) map.value.removeLayer(tiles)
  tiles = tileLayer(L, next).addTo(map.value)
  tiles.bringToBack()
}

function handleIcon(index: number): Leaflet.DivIcon {
  const last = draft.value.handles.length - 1
  const role = index === 0 ? ' start' : index === last && last > 0 ? ' finish' : ''
  const chosen = index === selected.value ? ' chosen' : ''
  const mark = { testid: `route-handle-${index}` }
  return L!.divIcon({
    className: `jp-route-handle${role}${chosen}`,
    iconSize: [HANDLE_SIZE, HANDLE_SIZE],
    iconAnchor: [HANDLE_SIZE / 2, HANDLE_SIZE / 2],
    html: `<i class="${props.hueClass}" data-testid="${mark.testid}"></i>`,
  })
}

function draw() {
  if (!map.value || !L || !framed) return
  drawn?.remove()
  const group = L.layerGroup()
  const d = draft.value
  if (anyChanged.value && props.original) {
    const original = props.original.points.map((p) => [p.lat, p.lon] as [number, number])
    L.polyline(original, { className: 'jp-track-halo faint', interactive: false }).addTo(group)
    L.polyline(original, {
      className: `jp-route-original ${props.hueClass}`,
      interactive: false,
    }).addTo(group)
  }
  // Changed legs last, so a path walked twice shows the change on top.
  const order = d.legs
    .map((_, i) => i)
    .sort((a, b) => Number(isChanged(d, a)) - Number(isChanged(d, b)))
  for (const i of order) {
    const points = legPoints(d, i).map((p) => [p.lat, p.lon] as [number, number])
    const waiting = d.legs[i]!.points === null
    const hue = isChanged(d, i) ? changedHue.value : props.hueClass
    L.polyline(points, { className: 'jp-track-halo', interactive: false }).addTo(group)
    L.polyline(points, {
      className: `jp-track-line jp-route-leg ${hue}${waiting ? ' waiting' : ''}`,
      interactive: false,
    }).addTo(group)
    L.polyline(points, { className: 'jp-route-hit', weight: 24, opacity: 0 })
      .on('click', (event: Leaflet.LeafletMouseEvent) => {
        L!.DomEvent.stopPropagation(event)
        tapLine(event.latlng)
      })
      .addTo(group)
  }
  directionArrows(L, map.value, () => line.value.map((p) => [p.lat, p.lon])).addTo(group)
  d.handles.forEach((_, index) => {
    const place = handlePlace(d, index)
    const marker = L!
      .marker([place.lat, place.lon], {
        icon: handleIcon(index),
        draggable: true,
        autoPan: true,
        zIndexOffset: index === selected.value ? 1000 : 0,
        keyboard: false,
      })
      .addTo(group)
    marker.on('click', (event: Leaflet.LeafletMouseEvent) => {
      L!.DomEvent.stopPropagation(event)
      passes.value = null
      selected.value = selected.value === index ? null : index
    })
    marker.on('dragstart', () => {
      selected.value = null
      rubber = L!
        .polyline([], { className: `jp-route-rubber ${props.hueClass}`, interactive: false })
        .addTo(map.value!)
    })
    marker.on('drag', () => {
      const here = marker.getLatLng()
      const neighbours = [d.handles[index - 1], d.handles[index + 1]]
      rubber?.setLatLngs([
        ...(neighbours[0] ? [[neighbours[0].lat, neighbours[0].lon] as [number, number]] : []),
        here,
        ...(neighbours[1] ? [[neighbours[1].lat, neighbours[1].lon] as [number, number]] : []),
      ])
    })
    marker.on('dragend', () => {
      rubber?.remove()
      rubber = null
      const here = marker.getLatLng()
      edit((current) => moveHandle(current, index, { lat: here.lat, lon: here.lng }, mode.value))
    })
  })
  drawn = group.addTo(map.value)
}

function tapLine(at: Leaflet.LatLng) {
  if (!map.value) return
  selected.value = null
  const project = (p: LatLon) => map.value!.latLngToContainerPoint([p.lat, p.lon])
  const found = passesAt(draft.value, project({ lat: at.lat, lon: at.lng }), project)
  if (found.length === 0) return
  if (found.length === 1) {
    edit((d) => insertAt(d, found[0]!))
    selected.value = found[0]!.leg + 1
    return
  }
  passes.value = found
}

function choosePass(pass: Pass) {
  passes.value = null
  edit((d) => insertAt(d, pass))
  selected.value = pass.leg + 1
}

function drawPassPreview() {
  preview?.remove()
  preview = null
  if (!map.value || !L || !passes.value) return
  const group = L.layerGroup()
  passes.value.forEach((pass, n) => {
    const stretch = stretchFrom(draft.value, pass, PASS_PREVIEW_M).map(
      (p) => [p.lat, p.lon] as [number, number],
    )
    L!.polyline(stretch, { className: 'jp-route-pass-halo', interactive: false }).addTo(group)
    L!.polyline(stretch, { className: 'jp-route-pass', interactive: false }).addTo(group)
    directionArrows(L!, map.value!, () => stretch).addTo(group)
    L!
      .marker(stretch[stretch.length - 1]!, {
        interactive: false,
        keyboard: false,
        icon: L!.divIcon({
          className: 'jp-route-pass-number',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
          html: `<span>${n + 1}</span>`,
        }),
      })
      .addTo(group)
  })
  preview = group.addTo(map.value)
}

function scrub(place: LatLon | null) {
  if (!map.value || !L) return
  if (!place) {
    scrubMark?.remove()
    scrubMark = null
    return
  }
  if (scrubMark) scrubMark.setLatLng([place.lat, place.lon])
  else {
    scrubMark = L.marker([place.lat, place.lon], {
      interactive: false,
      keyboard: false,
      zIndexOffset: 2000,
      icon: L.divIcon({ className: 'jp-route-scrub', iconSize: [14, 14], iconAnchor: [7, 7] }),
    }).addTo(map.value)
  }
}

watch(
  [() => props.open, host],
  ([open, element]) => {
    if (open && element) void mount()
  },
  { immediate: true },
)
watch([draft, selected], draw)
watch(passes, drawPassPreview)
watch(kind, (next) => editor.value?.setKind(next))

onBeforeUnmount(stop)

// --- the tools ---

function cutBefore() {
  const index = selected.value
  if (index === null) return
  selected.value = null
  edit((d) => startAt(d, index))
}

function cutAfter() {
  const index = selected.value
  if (index === null) return
  selected.value = null
  edit((d) => endAt(d, index))
}

function removeSelected() {
  const index = selected.value
  if (index === null) return
  selected.value = null
  edit((d) => removeHandle(d, index, mode.value))
}

async function cancel() {
  if (editor.value?.edited.value) {
    const discard = await confirmDestructive({
      header: t('routeEdit.discardTitle'),
      message: t('routeEdit.discardMessage'),
      confirmLabel: t('routeEdit.discard'),
      testid: 'route-discard-confirm',
    })
    if (!discard) return
  }
  emit('close')
}

function openSave() {
  if (!canSave.value) return
  selected.value = null
  passes.value = null
  name.value = props.original
    ? t('routeEdit.variantName', { name: props.original.name })
    : t(`routeEdit.newName.${kind.value}`)
  saving.value = true
}

async function save(how: SavedRoute['how']) {
  await editor.value?.settled()
  const chosen = name.value.trim()
  emit('save', {
    how,
    name: how === 'replace' ? props.original!.name : chosen || t(`routeEdit.newName.${kind.value}`),
    kind: kind.value,
    points: line.value.map(({ lat, lon, ele }) => ({ lat, lon, ele })),
  })
}
</script>

<template>
  <IonModal
    :is-open="open"
    class="track-editor"
    data-testid="route-editor"
    :backdrop-dismiss="false"
    @did-dismiss="emit('close')"
  >
    <div class="editor">
      <header class="bar">
        <button
          type="button"
          class="icon-button"
          :aria-label="t('common.cancel')"
          data-testid="route-cancel"
          @click="cancel"
        >
          <IonIcon :icon="close" aria-hidden="true" />
        </button>
        <span class="heading">
          <span class="jp-sheet-title">
            {{ original ? t('routeEdit.title') : t('routeEdit.titleNew') }}
          </span>
          <span class="sub">{{ original ? original.name : title }}</span>
        </span>
        <button
          type="button"
          class="done"
          :disabled="!canSave"
          data-testid="route-done"
          @click="openSave"
        >
          {{ settled ? t('routeEdit.done') : t('routeEdit.working') }}
        </button>
      </header>

      <div class="stage">
        <div
          ref="host"
          class="map track-map"
          :data-handles="draft.handles.length"
          :data-settled="settled ? 'true' : 'false'"
          data-testid="route-map"
        />
        <div class="sources" role="group">
          <button
            v-for="option in ['swisstopo', 'osm'] as const"
            :key="option"
            type="button"
            :aria-pressed="source === option ? 'true' : 'false'"
            :data-testid="`route-source-${option}`"
            @click="setSource(option)"
          >
            {{ t(`track.source.${option}`) }}
          </button>
        </div>
        <div class="tools">
          <button
            type="button"
            class="tool"
            :disabled="!editor?.canUndo.value"
            :aria-label="t('routeEdit.undo')"
            data-testid="route-undo"
            @click="editor?.undo()"
          >
            <IonIcon :icon="arrowUndoOutline" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool"
            :disabled="!editor?.canRedo.value"
            :aria-label="t('routeEdit.redo')"
            data-testid="route-redo"
            @click="editor?.redo()"
          >
            <IonIcon :icon="arrowRedoOutline" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool"
            :disabled="draft.handles.length < 2 || isLoop(draft)"
            :aria-label="t('routeEdit.loop')"
            data-testid="route-loop"
            @click="edit((d) => closeLoop(d, mode))"
          >
            <IonIcon :icon="repeatOutline" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool"
            :disabled="draft.handles.length < 2"
            :aria-label="t('routeEdit.reverse')"
            data-testid="route-reverse"
            @click="edit(reverse)"
          >
            <IonIcon :icon="swapVerticalOutline" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="tool"
            :aria-label="t('routeEdit.fit')"
            data-testid="route-fit"
            @click="fit"
          >
            <IonIcon :icon="scanOutline" aria-hidden="true" />
          </button>
        </div>

        <div
          v-if="routing !== '' && selected === null && !passes"
          class="follow"
          role="group"
          :aria-label="t('routeEdit.followLabel')"
        >
          <button
            type="button"
            :aria-pressed="followPaths ? 'true' : 'false'"
            data-testid="route-follow-paths"
            @click="followPaths = true"
          >
            {{ t('routeEdit.followPaths') }}
          </button>
          <button
            type="button"
            :aria-pressed="followPaths ? 'false' : 'true'"
            data-testid="route-follow-line"
            @click="followPaths = false"
          >
            {{ t('routeEdit.straight') }}
          </button>
        </div>

        <div v-if="selected !== null" class="pop" data-testid="route-point">
          <div class="pop-head">
            <span class="jp-num">
              <b>{{
                selected === 0
                  ? t('routeEdit.pointStart')
                  : selected === draft.handles.length - 1
                    ? t('routeEdit.pointEnd')
                    : t('routeEdit.point', { n: selected + 1 })
              }}</b>
              <template v-if="selected > 0">
                · {{ t('routeEdit.pointAt', { distance: formatDistance(selectedAt) }) }}
              </template>
            </span>
            <button
              type="button"
              class="icon-button small"
              :aria-label="t('common.close')"
              @click="selected = null"
            >
              <IonIcon :icon="close" aria-hidden="true" />
            </button>
          </div>
          <div class="pop-actions">
            <button
              type="button"
              :disabled="selected === 0"
              data-testid="route-start-here"
              @click="cutBefore"
            >
              {{ t('routeEdit.startHere') }}
            </button>
            <button
              type="button"
              :disabled="selected === draft.handles.length - 1"
              data-testid="route-end-here"
              @click="cutAfter"
            >
              {{ t('routeEdit.endHere') }}
            </button>
            <button
              type="button"
              class="danger"
              data-testid="route-remove-point"
              @click="removeSelected"
            >
              {{ t('routeEdit.removePoint') }}
            </button>
          </div>
        </div>

        <div v-if="passes" class="pop" data-testid="route-passes">
          <div class="pop-head">
            <span>
              <b>{{ t('routeEdit.passTitle') }}</b> {{ t('routeEdit.passWhy') }}
            </span>
            <button
              type="button"
              class="icon-button small"
              :aria-label="t('common.cancel')"
              data-testid="route-passes-cancel"
              @click="passes = null"
            >
              <IonIcon :icon="close" aria-hidden="true" />
            </button>
          </div>
          <button
            v-for="(pass, n) in passes"
            :key="n"
            type="button"
            class="pass"
            :data-testid="`route-pass-${n}`"
            @click="choosePass(pass)"
          >
            <span class="number">{{ n + 1 }}</span>
            <span class="pass-text">
              <b>{{
                passes.length === 2
                  ? t(n === 0 ? 'routeEdit.passOut' : 'routeEdit.passBack')
                  : t('routeEdit.passN', { n: n + 1 })
              }}</b>
              <small class="jp-num">{{
                t('routeEdit.pointAt', { distance: formatDistance(pass.distanceM) })
              }}</small>
            </span>
            <svg
              class="way"
              viewBox="0 0 24 24"
              aria-hidden="true"
              :style="{ transform: `rotate(${pass.degrees}deg)` }"
            >
              <path d="M4 12h15M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>

      <footer class="foot">
        <dl class="figures">
          <div class="fig">
            <dt>{{ t('track.distance') }}</dt>
            <dd class="jp-num" data-testid="route-distance">
              {{ formatDistance(figures.distanceM) }}
            </dd>
          </div>
          <div class="fig">
            <dt>{{ t('track.ascent') }}</dt>
            <dd class="jp-num" data-testid="route-ascent">
              {{ figures.ascentM === null ? '–' : `↑ ${formatMetres(figures.ascentM)}` }}
            </dd>
          </div>
          <div class="fig">
            <dt>{{ t('track.descent') }}</dt>
            <dd class="jp-num" data-testid="route-descent">
              {{ figures.descentM === null ? '–' : `↓ ${formatMetres(figures.descentM)}` }}
            </dd>
          </div>
          <div class="fig">
            <dt>{{ t(`track.moving.${kind}`) }}</dt>
            <dd class="jp-num" data-testid="route-moving">
              {{ draft.handles.length > 1 ? formatDuration(minutes) : '–' }}
            </dd>
          </div>
        </dl>
        <p v-if="anyChanged" class="legend" data-testid="route-legend">
          <span><i class="swatch" :class="hueClass" />{{ t('routeEdit.legendKept') }}</span>
          <span><i class="swatch" :class="changedHue" />{{ t('routeEdit.legendChanged') }}</span>
          <span
            ><i class="swatch dotted" :class="hueClass" />{{ t('routeEdit.legendBefore') }}</span
          >
        </p>
        <p v-if="before" class="before jp-num" data-testid="route-before">
          {{
            t('routeEdit.before', {
              distance: formatDistance(before.figures.distanceM),
              time: formatDuration(before.minutes),
            })
          }}
          <template v-if="delta">
            ·
            <span :class="delta.metres <= 0 ? 'less' : 'more'" data-testid="route-delta">
              <template v-if="Math.abs(delta.metres) >= DELTA_MIN_M">
                {{ signed(delta.metres, formatDistance(Math.abs(delta.metres))) }}
              </template>
              {{ signed(delta.minutes, formatDuration(Math.abs(delta.minutes))) }}
            </span>
          </template>
        </p>
        <div v-else class="kinds" role="group" :aria-label="t('track.kindLabel')">
          <button
            v-for="option in [TRACK_KIND.hike, TRACK_KIND.bike]"
            :key="option"
            type="button"
            :aria-pressed="kind === option ? 'true' : 'false'"
            :data-testid="`route-kind-${option}`"
            @click="kind = option"
          >
            {{ t(`track.kind.${option}`) }}
          </button>
        </div>
        <RouteProfile
          :points="line"
          :handle-distances="handleDistances"
          :hue-class="hueClass"
          :changed-hue-class="changedHue"
          @scrub="scrub"
        />
        <p class="status" data-testid="route-status">
          <span v-if="!settled" class="spinner" aria-hidden="true" />
          <span class="hint" data-testid="route-hint">{{ hint }}</span>
          <span v-if="status">{{ status }}</span>
        </p>
      </footer>

      <div v-if="saving" class="scrim" @click="saving = false" />
      <section v-if="saving" class="save" data-testid="route-save">
        <h2 class="jp-sheet-title">{{ t('routeEdit.saveTitle') }}</h2>
        <p class="save-figures jp-num">
          {{ formatDistance(figures.distanceM) }}
          <template v-if="figures.ascentM !== null">
            · ↑ {{ formatMetres(figures.ascentM) }}</template
          >
          · {{ formatDuration(minutes) }} {{ t(`track.moving.${kind}`) }}
        </p>
        <label class="name">
          <span>{{ t('routeEdit.nameLabel') }}</span>
          <input v-model="name" type="text" maxlength="200" data-testid="route-save-name" />
        </label>
        <button
          type="button"
          class="choice primary"
          :disabled="!canAddNew"
          data-testid="route-save-new"
          @click="save('new')"
        >
          <b>{{ original ? t('routeEdit.saveNew') : t('routeEdit.saveTrack') }}</b>
          <small>{{
            !canAddNew
              ? t('routeEdit.saveFull')
              : original
                ? t('routeEdit.saveNewWhy')
                : t('routeEdit.saveTrackWhy')
          }}</small>
        </button>
        <button
          v-if="original"
          type="button"
          class="choice"
          data-testid="route-save-replace"
          @click="save('replace')"
        >
          <b>{{ t('routeEdit.saveReplace', { name: original.name }) }}</b>
          <small>{{ t('routeEdit.saveReplaceWhy') }}</small>
        </button>
        <button
          type="button"
          class="choice plain"
          data-testid="route-save-back"
          @click="saving = false"
        >
          {{ t('routeEdit.keepEditing') }}
        </button>
      </section>
    </div>
  </IonModal>
</template>

<style scoped>
.track-editor {
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
  --background: var(--ct-crust);
}

.editor {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px);
  background: var(--ct-crust);
  color: var(--ct-text);
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 8px 8px;
  background: var(--jp-surface-page);
  border-bottom: 1px solid var(--jp-surface-border);
}

.heading {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.sub {
  overflow: hidden;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.done {
  min-height: 36px;
  padding: 6px 16px;
  border: 0;
  border-radius: var(--jp-r-pill);
  background: var(--jp-brand);
  color: var(--ct-base);
  font: inherit;
  font-weight: var(--jp-weight-bold);
  cursor: pointer;
}

.done:disabled {
  opacity: 0.45;
  cursor: default;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ct-text);
  cursor: pointer;
}

.icon-button.small {
  width: 30px;
  height: 30px;
}

.icon-button ion-icon {
  font-size: var(--jp-icon-md);
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

.sources {
  position: absolute;
  z-index: 500;
  top: 10px;
  left: 10px;
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--jp-r-pill);
  background: color-mix(in srgb, var(--jp-surface-card) 92%, transparent);
}

.sources button,
.follow button,
.kinds button {
  min-height: 32px;
  padding: 4px 12px;
  border: 0;
  border-radius: var(--jp-r-pill);
  background: transparent;
  color: var(--ct-subtext1);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
  white-space: nowrap;
}

.sources button[aria-pressed='true'],
.follow button[aria-pressed='true'],
.kinds button[aria-pressed='true'] {
  background: var(--jp-action);
  color: var(--ct-base);
  font-weight: var(--jp-weight-semibold);
}

.tools {
  position: absolute;
  z-index: 500;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--jp-surface-border);
  border-radius: 50%;
  background: var(--jp-surface-card);
  box-shadow: var(--jp-shadow);
  color: var(--ct-text);
  cursor: pointer;
}

.tool ion-icon {
  font-size: var(--jp-icon-md);
}

.tool:disabled {
  opacity: 0.4;
  cursor: default;
}

.follow {
  position: absolute;
  z-index: 500;
  bottom: 12px;
  left: 10px;
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-pill);
  background: color-mix(in srgb, var(--jp-surface-card) 94%, transparent);
  box-shadow: var(--jp-shadow);
}

.pop {
  position: absolute;
  z-index: 800;
  right: 10px;
  bottom: 12px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-lg);
  background: var(--jp-surface-card);
  box-shadow: var(--jp-shadow-sheet);
}

.pop-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px 2px 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.pop-head > span {
  flex: 1;
}

.pop-head b {
  color: var(--ct-text);
}

.pop-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.pop-actions button,
.pass {
  min-height: 44px;
  padding: 8px;
  border: 0;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.pop-actions button:disabled {
  opacity: 0.35;
  cursor: default;
}

.pop-actions .danger {
  color: var(--ct-ember);
}

.pass {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
}

.pass-text {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.pass-text small {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.number {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 2px solid var(--ct-base);
  border-radius: 50%;
  background: var(--jp-action);
  color: var(--ct-base);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-bold);
}

.way {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: var(--jp-action);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.foot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px 8px;
  background: var(--jp-surface-page);
  border-top: 1px solid var(--jp-surface-border);
}

.figures {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin: 0;
}

.fig {
  display: flex;
  flex-direction: column-reverse;
  min-width: 0;
}

.fig dt {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
}

.fig dd {
  margin: 0;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  white-space: nowrap;
}

.legend,
.before,
.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin: 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-2xs);
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.swatch {
  display: inline-block;
  width: 16px;
  height: 0;
  border-top: 4px solid;
  border-radius: var(--jp-r-xs);
}

.swatch.dotted {
  border-top-style: dotted;
  border-top-width: 3px;
}

.swatch.jp-track-larch {
  border-color: var(--ct-larch);
}

.swatch.jp-track-glacier {
  border-color: var(--ct-glacier);
}

.swatch.jp-track-heather {
  border-color: var(--ct-heather);
}

.swatch.jp-track-alpenrose {
  border-color: var(--ct-alpenrose);
}

.swatch.jp-track-pine {
  border-color: var(--ct-pine);
}

.before .less {
  color: var(--ct-pine);
  font-weight: var(--jp-weight-bold);
}

.before .more {
  color: var(--ct-ember);
  font-weight: var(--jp-weight-bold);
}

.kinds {
  display: inline-flex;
  align-self: flex-start;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--ct-surface1);
  border-top-color: var(--jp-action);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.hint {
  color: var(--ct-subtext1);
}

.scrim {
  position: absolute;
  z-index: 1000;
  inset: 0;
  background: var(--jp-scrim);
}

.save {
  position: absolute;
  z-index: 1001;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  border-radius: var(--jp-r-lg) var(--jp-r-lg) 0 0;
  background: var(--jp-surface-card);
  box-shadow: var(--jp-shadow-sheet);
}

.save h2 {
  margin: 0;
}

.save-figures {
  margin: 0 0 4px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.name {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.name input {
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-base);
}

.choice {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.choice b {
  font-size: var(--jp-text-base);
}

.choice small {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.choice.primary {
  border-color: var(--jp-brand);
  background: color-mix(in srgb, var(--jp-brand) 12%, var(--jp-surface-sunken));
}

.choice.plain {
  align-items: center;
  border: 0;
  background: transparent;
  color: var(--ct-subtext1);
}

.choice:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>

<style>
/* The editor's Leaflet elements: handles, the route's legs and what a
   choice between passes shows (FR-29.20). Outside the scope, like the
   track map's (`trackMap.css`). */
.jp-route-handle {
  display: grid;
  place-items: center;
}

.jp-route-handle i {
  display: block;
  width: 14px;
  height: 14px;
  border: 3px solid currentColor;
  border-radius: 50%;
  background: var(--ct-text);
  box-shadow: var(--jp-shadow);
  transition: transform 0.12s;
}

.jp-route-handle i.jp-track-larch {
  color: var(--ct-larch);
}

.jp-route-handle i.jp-track-glacier {
  color: var(--ct-glacier);
}

.jp-route-handle i.jp-track-heather {
  color: var(--ct-heather);
}

.jp-route-handle i.jp-track-alpenrose {
  color: var(--ct-alpenrose);
}

.jp-route-handle i.jp-track-pine {
  color: var(--ct-pine);
}

.jp-route-handle.start i {
  border-color: var(--ct-text);
  background: var(--ct-pine);
}

.jp-route-handle.finish i {
  border-color: var(--ct-text);
  background: var(--ct-ember);
}

.jp-route-handle.chosen i {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--jp-action) 45%, transparent);
  transform: scale(1.45);
}

.track-map .jp-route-leg {
  stroke-width: 5px;
}

.track-map .jp-route-leg.waiting {
  stroke-dasharray: 4 9;
}

.track-map .jp-route-original {
  fill: none;
  stroke-width: 3px;
  stroke-dasharray: 2 8;
}

.track-map .faint {
  opacity: 0.4;
}

.track-map .jp-route-hit {
  stroke: transparent;
  fill: none;
}

.track-map .jp-route-rubber {
  fill: none;
  stroke-width: 3px;
  stroke-dasharray: 2 7;
}

.track-map .jp-route-pass-halo {
  fill: none;
  stroke: var(--ct-text);
  stroke-width: 11px;
  opacity: 0.9;
}

.track-map .jp-route-pass {
  fill: none;
  stroke: var(--jp-action);
  stroke-width: 6px;
}

.jp-route-pass-number span {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 2px solid var(--ct-text);
  border-radius: 50%;
  background: var(--jp-action);
  color: var(--ct-base);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-bold);
  box-shadow: var(--jp-shadow);
}

.jp-route-scrub {
  border: 3px solid var(--jp-action);
  border-radius: 50%;
  background: var(--ct-text);
  box-shadow: var(--jp-shadow);
}
</style>
