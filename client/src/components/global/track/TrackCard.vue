<script setup lang="ts">
/**
 * A set of GPX tracks on a card (FR-29.17, ADR-085): a chip per track from
 * two on, a still map carrying all of them, the chosen one's figures and
 * time, and its file with what can be done to it. A tap on the map opens
 * the full-screen map.
 *
 * Kernel, not the planner's: it knows tracks, never what they hang on, so
 * FR-31's excursions can carry the same card. What is done to a track is
 * handed up as an event; the owner writes it.
 */
import { IonIcon } from '@ionic/vue'
import { documentOutline, expandOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import { decodeLine, defaultSource, type TrackSettings } from '@/domain/shared/track'
import { formatNumber, t } from '@/i18n'
import type { TrackFields } from '@/types/domain'
import TrackFigures from './TrackFigures.vue'
import TrackMap from './TrackMap.vue'
import TrackMore from './TrackMore.vue'
import TrackTabs from './TrackTabs.vue'
import TrackViewer from './TrackViewer.vue'
import { trackHueClass, type MapLine } from '@/lib/trackColors'

const props = defineProps<{
  /** In their order; the first is chosen until another is. */
  tracks: TrackFields[]
  /** What the tracks belong to — the full-screen map's title. */
  title: string
  /** The trip they are on, for who is where on the full-screen map (FR-29.19). */
  tripId?: string
}>()

const chosenId = defineModel<string | null>('chosen', { default: null })

const emit = defineEmits<{
  update: [track: TrackFields, settings: TrackSettings]
  download: [track: TrackFields]
  replace: [track: TrackFields, file: File]
  remove: [track: TrackFields]
  /** FR-29.20: the track's route is to be edited — the owner loads its file. */
  edit: [track: TrackFields]
}>()

const chosen = computed(
  () => props.tracks.find((track) => track.id === chosenId.value) ?? props.tracks[0] ?? null,
)

// A removed track hands the choice on; a new one has been chosen by its owner.
watch(
  () => props.tracks.map((track) => track.id).join(),
  () => {
    if (!props.tracks.some((track) => track.id === chosenId.value)) {
      chosenId.value = props.tracks[0]?.id ?? null
    }
  },
  { immediate: true },
)

/** Decoded once per line, not on every redraw. */
const decoded = new Map<string, [number, number][]>()
function points(track: TrackFields): [number, number][] {
  let line = decoded.get(track.line)
  if (!line) {
    line = decodeLine(track.line)
    decoded.set(track.line, line)
  }
  return line
}

const lines = computed<MapLine[]>(() =>
  props.tracks.map((track, index) => ({
    id: track.id,
    points: points(track),
    hueClass: trackHueClass(index),
    chosen: track.id === chosen.value?.id,
  })),
)

const source = computed(() => defaultSource(lines.value.map((line) => line.points)))
const viewing = ref(false)

function choose(id: string) {
  chosenId.value = id
}

/** The editor opens over the card; the full-screen map it was asked from closes first. */
function openEditorFromViewer() {
  viewing.value = false
  if (chosen.value) emit('edit', chosen.value)
}
</script>

<template>
  <section v-if="chosen" class="track-card" data-testid="track-card">
    <TrackTabs :tracks="tracks" :lines="lines" @choose="choose" />

    <div class="mini">
      <TrackMap class="map" :lines="lines" :source="source" data-testid="track-map" />
      <span class="source-badge">{{ t(`track.source.${source}`) }}</span>
      <button
        type="button"
        class="open"
        :aria-label="t('track.mapOf', { title })"
        data-testid="track-map-open"
        @click="viewing = true"
      >
        <IonIcon :icon="expandOutline" aria-hidden="true" />
      </button>
    </div>

    <TrackFigures :track="chosen" @update="(settings) => emit('update', chosen!, settings)" />

    <div class="file">
      <IonIcon :icon="documentOutline" aria-hidden="true" />
      <span class="file-name" data-testid="track-file">
        {{ t('track.file', { name: chosen.file_name, n: formatNumber(chosen.point_count) }) }}
      </span>
      <TrackMore
        :track="chosen"
        @edit="(track) => emit('edit', track)"
        @update="(track, settings) => emit('update', track, settings)"
        @download="(track) => emit('download', track)"
        @replace="(track, file) => emit('replace', track, file)"
        @remove="(track) => emit('remove', track)"
      />
    </div>

    <TrackViewer
      :open="viewing"
      :title="title"
      :tracks="tracks"
      :lines="lines"
      :chosen="chosen"
      :trip-id="tripId"
      @close="viewing = false"
      @choose="choose"
      @edit="openEditorFromViewer"
      @update="(track, settings) => emit('update', track, settings)"
    />
  </section>
</template>

<style scoped>
.track-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mini {
  position: relative;
  aspect-ratio: 16 / 7;
  overflow: hidden;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
}

.map {
  position: absolute;
  inset: 0;
}

.source-badge {
  position: absolute;
  z-index: 500;
  top: 8px;
  left: 8px;
  padding: 1px 8px;
  border-radius: var(--jp-r-pill);
  background: color-mix(in srgb, var(--jp-surface-card) 88%, transparent);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-2xs);
  pointer-events: none;
}

.mini [data-tiles='off'] ~ .source-badge,
.mini [data-tiles='offline'] ~ .source-badge {
  display: none;
}

/* The whole map is the button; its glyph sits in the corner. */
.open {
  position: absolute;
  z-index: 600;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 8px;
  border: 0;
  background: transparent;
  color: var(--ct-text);
  cursor: zoom-in;
}

.open ion-icon {
  padding: 5px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--jp-surface-card) 88%, transparent);
  font-size: var(--jp-icon-sm);
}

.file {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
