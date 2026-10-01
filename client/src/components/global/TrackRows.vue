<script setup lang="ts">
/**
 * A set of GPX tracks as quiet lines (FR-31.15): a line per track — its kind
 * in its colour, its name, its distance, climb and time — that opens the
 * full-screen map on it, with the track's ⋮ in the map's bar. An excursion's
 * list carries it, under its notes, where the track card's map would push
 * the list down.
 *
 * Kernel, like the card: it knows tracks, never what they hang on, and
 * hands every act up.
 */
import { IonIcon } from '@ionic/vue'
import { bicycleOutline, chevronForward, walkOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import { decodeLine, movingMinutes, type TrackSettings } from '@/domain/track'
import { formatDistance, formatDuration, formatMetres } from '@/lib/trackFormat'
import type { TrackFields } from '@/types/domain'
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
}>()

const emit = defineEmits<{
  update: [track: TrackFields, settings: TrackSettings]
  download: [track: TrackFields]
  replace: [track: TrackFields, file: File]
  remove: [track: TrackFields]
  /** FR-29.20: the track's route is to be edited — the owner loads its file. */
  edit: [track: TrackFields]
}>()

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
  <ul class="track-rows" data-testid="track-rows">
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
  <TrackViewer
    :open="viewing"
    :title="title"
    :tracks="tracks"
    :lines="lines"
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
/* The quiet line of an excursion's notes (ExcursionNotes), so the two read as one block. */
.track-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 4px;
  border: none;
  background: none;
  color: var(--ct-subtext1);
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
</style>
