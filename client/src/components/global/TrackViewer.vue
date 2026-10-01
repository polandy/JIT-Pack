<script setup lang="ts">
/**
 * The full-screen map of a set of tracks (FR-29.17): panned and zoomed by
 * touch, its source switched between the Landeskarte and OpenStreetMap, the
 * chosen track framed again on a tap, and at its foot the same chips and
 * figures as the card. On the crust surface, like an idea's picture viewer.
 */
import { IonIcon, IonModal } from '@ionic/vue'
import { close, scanOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import { defaultSource, inSwitzerland, type MapSource } from '@/domain/track'
import { t } from '@/i18n'
import { useTileState } from '@/lib/mapTiles'
import type { TrackFields } from '@/types/domain'
import TrackFigures from './TrackFigures.vue'
import TrackMap from './TrackMap.vue'
import TrackTabs from './TrackTabs.vue'
import type { MapLine } from './trackColors'

const props = defineProps<{
  open: boolean
  title: string
  tracks: TrackFields[]
  lines: MapLine[]
  chosen: TrackFields | null
}>()

const emit = defineEmits<{
  close: []
  choose: [id: string]
  update: [
    track: TrackFields,
    settings: Partial<Pick<TrackFields, 'kind' | 'with_kid' | 'pause_min'>>,
  ]
}>()

const SOURCES: MapSource[] = ['swisstopo', 'osm']

const tiles = useTileState()
const swiss = computed(() => inSwitzerland(props.lines.map((line) => line.points)))
const source = ref<MapSource>('osm')
const map = ref<InstanceType<typeof TrackMap> | null>(null)

// Each opening starts on the map that suits the tracks.
watch(
  () => props.open,
  (open) => {
    if (open) source.value = defaultSource(props.lines.map((line) => line.points))
  },
  { immediate: true },
)
</script>

<template>
  <IonModal
    :is-open="open"
    class="track-viewer"
    data-testid="track-viewer"
    @did-dismiss="emit('close')"
  >
    <div class="viewer">
      <header class="bar">
        <span class="title jp-sheet-title">{{ title }}</span>
        <button
          type="button"
          class="icon-button"
          :aria-label="t('common.close')"
          data-testid="track-viewer-close"
          @click="emit('close')"
        >
          <IonIcon :icon="close" aria-hidden="true" />
        </button>
      </header>

      <div class="stage">
        <TrackMap
          ref="map"
          class="map"
          :lines="lines"
          :source="source"
          interactive
          data-testid="track-viewer-map"
          @choose="emit('choose', $event)"
        />
        <template v-if="tiles === 'on'">
          <div class="sources" role="group">
            <button
              v-for="option in SOURCES"
              :key="option"
              type="button"
              :aria-pressed="source === option ? 'true' : 'false'"
              :disabled="option === 'swisstopo' && !swiss"
              :data-testid="`track-source-${option}`"
              @click="source = option"
            >
              {{ t(`track.source.${option}`) }}
            </button>
          </div>
          <button
            type="button"
            class="icon-button fit"
            :aria-label="t('track.fit')"
            data-testid="track-fit"
            @click="map?.fit()"
          >
            <IonIcon :icon="scanOutline" aria-hidden="true" />
          </button>
        </template>
      </div>

      <footer v-if="chosen" class="foot">
        <TrackTabs :tracks="tracks" :lines="lines" @choose="emit('choose', $event)" />
        <TrackFigures :track="chosen" @update="(settings) => emit('update', chosen!, settings)" />
      </footer>
    </div>
  </IonModal>
</template>

<style scoped>
.track-viewer {
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
  --background: var(--ct-crust);
}

.viewer {
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
  gap: 10px;
  padding: 8px 12px;
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.icon-button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ct-surface0) 85%, transparent);
  color: var(--ct-text);
  cursor: pointer;
}

.icon-button ion-icon {
  font-size: var(--jp-icon-md);
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

.sources button {
  min-height: 32px;
  padding: 4px 12px;
  border: 0;
  border-radius: var(--jp-r-pill);
  background: transparent;
  color: var(--ct-subtext1);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.sources button[aria-pressed='true'] {
  background: var(--jp-action);
  color: var(--ct-base);
  font-weight: var(--jp-weight-semibold);
}

.sources button:disabled {
  opacity: 0.4;
  cursor: default;
}

.fit {
  position: absolute;
  z-index: 500;
  top: 10px;
  right: 10px;
}

.foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 50%;
  overflow-y: auto;
  padding: 12px 16px 16px;
  background: var(--jp-surface-page);
}
</style>
