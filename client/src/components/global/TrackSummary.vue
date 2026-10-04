<script setup lang="ts">
/**
 * A set of GPX tracks as a card of their own (FR-31.15): a still map with
 * every line on it, then a line per track — its kind in its colour, its
 * name, its distance, climb and time. The map opens the full-screen map on
 * the first track, a line on its own, with the track's ⋮ in the map's bar.
 * An excursion carries it at the top, above its packing list, so the route
 * is seen before what to pack for it. It folds to its head — the first
 * track's figures in one line — for whoever is packing rather than planning
 * the way; the owner keeps whether it is open.
 *
 * Kernel, like the card: it knows tracks, never what they hang on, and
 * hands every act up.
 */
import { IonIcon } from '@ionic/vue'
import {
  bicycleOutline,
  chevronDown,
  chevronForward,
  mapOutline,
  walkOutline,
} from 'ionicons/icons'
import { computed, ref } from 'vue'

import { decodeLine, defaultSource, movingMinutes, type TrackSettings } from '@/domain/track'
import { t } from '@/i18n'
import { formatDistance, formatDuration, formatMetres, tracksSummary } from '@/lib/trackFormat'
import type { TrackFields } from '@/types/domain'
import TrackMap from './TrackMap.vue'
import TrackMore from './TrackMore.vue'
import TrackViewer from './TrackViewer.vue'
import { trackHueClass, type MapLine } from './trackColors'

const props = defineProps<{
  /** In their order. */
  tracks: TrackFields[]
  /** What the tracks belong to — the full-screen map's title. */
  title: string
  /** The trip they are on, for who is where on the full-screen map (FR-29.19). */
  tripId?: string
  /**
   * Drawn inside another card that owns the head and the fold (FR-29.18's
   * *Der Tag*): no card of its own, no head, always open.
   */
  headless?: boolean
  /**
   * Lines that are not tracks, drawn beside them and framed with them — an
   * excursion's ways there and back (FR-29.18).
   */
  beside?: MapLine[]
}>()

const emit = defineEmits<{
  update: [track: TrackFields, settings: TrackSettings]
  download: [track: TrackFields]
  replace: [track: TrackFields, file: File]
  remove: [track: TrackFields]
  /** FR-29.20: the track's route is to be edited — the owner loads its file. */
  edit: [track: TrackFields]
}>()

/** Whether the map and the lines show, or the head alone. */
const expanded = defineModel<boolean>('open', { default: true })

const folded = computed(() => tracksSummary(props.tracks)?.text ?? '')

const viewing = ref(false)
const chosenId = ref<string | null>(null)

const chosen = computed(
  () => props.tracks.find((track) => track.id === chosenId.value) ?? props.tracks[0] ?? null,
)

const lines = computed<MapLine[]>(() =>
  props.tracks.map((track, index) => ({
    id: track.id,
    points: decodeLine(track.line),
    hueClass: trackHueClass(index),
    chosen: track.id === chosen.value?.id,
  })),
)

const source = computed(() => defaultSource(lines.value.map((line) => line.points)))
const drawn = computed(() => [...lines.value, ...(props.beside ?? [])])

/** „16,2 km · ↑ 1'046 m · 6 h 05" — the time with the travellers' own pauses. */
function facts(track: TrackFields): string {
  const parts = [formatDistance(track.distance_m)]
  if (track.ascent_m !== null) parts.push(`↑ ${formatMetres(track.ascent_m)}`)
  parts.push(formatDuration(movingMinutes(track) + track.pause_min))
  return parts.join(' · ')
}

function open(id: string) {
  chosenId.value = id
  viewing.value = true
}

/** The editor opens over the list; the full-screen map it was asked from closes first. */
function editChosen(track: TrackFields) {
  viewing.value = false
  emit('edit', track)
}

/** A track removed from the map closes it; the list says what is left. */
function removeChosen(track: TrackFields) {
  viewing.value = false
  emit('remove', track)
}
</script>

<template>
  <section
    class="track-summary"
    :class="{ 'jp-card': !headless, folded: !expanded && !headless, headless }"
    data-testid="track-summary"
  >
    <button
      v-if="!headless"
      type="button"
      class="head"
      :aria-expanded="expanded ? 'true' : 'false'"
      data-testid="track-summary-toggle"
      @click="expanded = !expanded"
    >
      <IonIcon class="glyph" :icon="mapOutline" aria-hidden="true" />
      <span class="label">{{ t('track.route') }}</span>
      <span v-if="!expanded" class="facts jp-num" data-testid="track-summary-folded">
        {{ folded }}
      </span>
      <IonIcon class="caret" :icon="chevronDown" aria-hidden="true" />
    </button>
    <div v-if="expanded || headless" class="mini">
      <TrackMap
        class="map"
        :lines="drawn"
        :source="source"
        :frame-all="(beside ?? []).length > 0"
        data-testid="track-summary-map"
      />
      <button
        type="button"
        class="open"
        :aria-label="t('track.mapOf', { title })"
        data-testid="track-summary-open"
        @click="open(chosen!.id)"
      ></button>
    </div>
    <ul v-if="expanded || headless" class="track-rows" data-testid="track-rows">
      <li v-for="(track, index) in tracks" :key="track.id">
        <button
          type="button"
          class="row"
          :class="trackHueClass(index)"
          :data-testid="`track-row-${track.id}`"
          @click="open(track.id)"
        >
          <IonIcon
            class="kind"
            :icon="track.kind === 'bike' ? bicycleOutline : walkOutline"
            aria-hidden="true"
          />
          <span class="name">{{ track.name }}</span>
          <span class="facts jp-num" :data-testid="`track-row-facts-${track.id}`">
            {{ facts(track) }}
          </span>
          <IonIcon class="chevron" :icon="chevronForward" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </section>
  <TrackViewer
    :open="viewing"
    :title="title"
    :tracks="tracks"
    :lines="drawn"
    :chosen="chosen"
    :trip-id="tripId"
    @close="viewing = false"
    @choose="(id) => (chosenId = id)"
    @edit="chosen && editChosen(chosen)"
    @update="(track, settings) => emit('update', track, settings)"
  >
    <template #actions="{ track }">
      <TrackMore
        :track="track"
        @edit="editChosen"
        @update="(edited, settings) => emit('update', edited, settings)"
        @download="(file) => emit('download', file)"
        @replace="(replaced, file) => emit('replace', replaced, file)"
        @remove="removeChosen"
      />
    </template>
  </TrackViewer>
</template>

<style scoped>
.track-summary {
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 6px 12px;
  border: none;
  background: none;
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-sm);
  text-align: start;
  cursor: pointer;
}

.head:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}

.head .label {
  flex: 1;
  font-weight: var(--jp-weight-semibold);
}

.glyph {
  flex: none;
  color: var(--ct-larch);
  font-size: var(--jp-icon-sm);
}

.caret {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-xs);
  transition: transform 0.18s ease;
}

.folded .caret {
  transform: rotate(-90deg);
}

.mini {
  position: relative;
  aspect-ratio: 16 / 7;
  border-block: 1px solid var(--jp-surface-border);
}

.map {
  position: absolute;
  inset: 0;
}

/* The whole map is the button. */
.open {
  position: absolute;
  z-index: 600;
  inset: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.track-rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 4px 8px;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 6px 4px;
  border: none;
  background: none;
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-sm);
  text-align: start;
  cursor: pointer;
}

.row:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
  border-radius: var(--jp-r-sm);
}

.name {
  flex: 1;
  font-weight: var(--jp-weight-semibold);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.facts {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.kind {
  flex: none;
  font-size: var(--jp-icon-sm);
}

.chevron {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-xs);
}

.jp-track-larch .kind {
  color: var(--ct-larch);
}

.jp-track-glacier .kind {
  color: var(--ct-glacier);
}

.jp-track-heather .kind {
  color: var(--ct-heather);
}

.jp-track-alpenrose .kind {
  color: var(--ct-alpenrose);
}

.jp-track-pine .kind {
  color: var(--ct-pine);
}

/* Inside *Der Tag*: the map as an inset of the step, the lines flush with its text. */
.headless .mini {
  overflow: hidden;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-sm);
}

.headless .track-rows {
  padding: 4px 0 0;
}

.headless .row {
  padding-inline: 0;
}
</style>
