<script setup lang="ts">
/**
 * The full-screen map of a set of tracks (FR-29.17): panned and zoomed by
 * touch, its source switched between the Landeskarte and OpenStreetMap, the
 * chosen track framed again on a tap, and at its foot the same chips and
 * figures as the card. On the crust surface, like an idea's picture viewer.
 *
 * Given its trip, it also shows where people are (FR-29.19, ADR-087): the
 * device's own position after a tap on 📍, and — where somebody else is on
 * the trip — a switch to share it and a switch to show the others'.
 */
import { IonIcon, IonModal } from '@ionic/vue'
import {
  close,
  createOutline,
  locateOutline,
  peopleOutline,
  radioOutline,
  scanOutline,
} from 'ionicons/icons'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { defaultSource, inSwitzerland, type MapSource } from '@/domain/track'
import { t } from '@/i18n'
import { LIVE_LOCATION } from '@/composables/useLiveLocation'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { initialsOf } from '@/lib/initials'
import { freshPeople, minutesAgo } from '@/lib/liveLocation'
import { useTileState } from '@/lib/mapTiles'
import type { TrackFields } from '@/types/domain'
import TrackFigures from './TrackFigures.vue'
import TrackMap from './TrackMap.vue'
import TrackTabs from './TrackTabs.vue'
import type { MapLine, MapMark } from './trackColors'

const props = defineProps<{
  open: boolean
  title: string
  tracks: TrackFields[]
  lines: MapLine[]
  chosen: TrackFields | null
  /** The trip the tracks belong to; without one, the map shows nobody. */
  tripId?: string
}>()

const emit = defineEmits<{
  close: []
  choose: [id: string]
  /** FR-29.20: the chosen track's route is to be edited. */
  edit: []
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

// --- where people are (FR-29.19) ---

const live = inject(LIVE_LOCATION, null)
const orchestrator = inject(ORCHESTRATOR, null)
const identity = props.tripId && orchestrator ? useTripIdentity(props.tripId, orchestrator) : null

/**
 * Somebody else to share with or to see: an identity and another account on
 * the trip — M28's rule for its votes (G-8). Not in Local or Single-User Mode.
 */
const othersOffered = computed(
  () => !!identity && identity.myUserId.value !== null && identity.assignees.value.length > 1,
)
const sharing = computed(() => !!props.tripId && !!live?.isSharing(props.tripId))

/** The minute the „vor n min" are counted against, moved on while the map is open. */
const minute = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
const MINUTE_MS = 60_000

watch(
  () => props.open,
  (open, was) => {
    if (open) {
      live?.hold()
      minute.value = Date.now()
      ticker ??= setInterval(() => (minute.value = Date.now()), MINUTE_MS)
    } else if (was) {
      live?.release()
      if (ticker) clearInterval(ticker)
      ticker = null
    }
  },
)
onMounted(() => {
  if (props.open) live?.hold()
})
onBeforeUnmount(() => {
  if (props.open) live?.release()
  if (ticker) clearInterval(ticker)
})

const marks = computed<MapMark[]>(() => {
  const list: MapMark[] = []
  const me = live?.me.value
  if (me) {
    list.push({
      id: 'me',
      kind: 'me',
      lat: me.lat,
      lon: me.lon,
      accuracyM: me.accuracyM,
      initials: '',
      title: t('track.me'),
    })
  }
  if (live && props.tripId && othersOffered.value && live.showOthers.value) {
    for (const { userId, fix } of freshPeople(live.others(props.tripId), minute.value)) {
      const name = identity?.nameOf(userId) ?? t('track.someone')
      const n = minutesAgo(fix, minute.value)
      list.push({
        id: userId,
        kind: 'person',
        lat: fix.lat,
        lon: fix.lon,
        accuracyM: fix.accuracyM,
        initials: initialsOf(name, userId),
        title: n === 0 ? t('track.personNow', { name }) : t('track.personAt', { name, n }),
      })
    }
  }
  return list
})

/** Whether the 📍 was tapped, so the first position to arrive is centred on. */
let centreOnArrival = false

function locate() {
  if (!live) return
  const me = live.me.value
  if (me) map.value?.focus(me.lat, me.lon)
  else centreOnArrival = true
  live.locate()
}

watch(
  () => live?.me.value,
  (me) => {
    if (me && centreOnArrival) {
      centreOnArrival = false
      map.value?.focus(me.lat, me.lon)
    }
  },
)

const locateNote = computed(() => {
  const state = live?.state.value
  if (state === 'denied') return t('track.locateDenied')
  if (state === 'unavailable') return t('track.locateUnavailable')
  return null
})

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
          v-if="chosen"
          type="button"
          class="edit"
          :disabled="tiles !== 'on'"
          :title="tiles !== 'on' ? t('track.editNeedsMap') : undefined"
          data-testid="track-viewer-edit"
          @click="emit('edit')"
        >
          <IonIcon :icon="createOutline" aria-hidden="true" />
          {{ t('track.editShort') }}
        </button>
        <!-- What else the owner offers on the chosen track: an excursion's ⋮ (FR-31.15). -->
        <slot v-if="chosen" name="actions" :track="chosen" />
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
          :marks="marks"
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
            v-if="live"
            type="button"
            class="icon-button locate"
            :aria-label="t('track.locate')"
            :aria-pressed="live.state.value === 'on' ? 'true' : 'false'"
            data-testid="track-locate"
            @click="locate"
          >
            <IonIcon :icon="locateOutline" aria-hidden="true" />
          </button>
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
        <p v-if="locateNote" class="locate-note" data-testid="track-locate-note">
          {{ locateNote }}
        </p>
      </div>

      <div v-if="live && tripId && othersOffered" class="people" data-testid="track-people">
        <button
          type="button"
          class="toggle"
          :aria-pressed="sharing ? 'true' : 'false'"
          data-testid="track-share"
          @click="live.setSharing(tripId, !sharing)"
        >
          <IonIcon :icon="radioOutline" aria-hidden="true" />
          {{ t('track.share') }}
        </button>
        <button
          type="button"
          class="toggle"
          :aria-pressed="live.showOthers.value ? 'true' : 'false'"
          data-testid="track-show-others"
          @click="live.setShowOthers(!live.showOthers.value)"
        >
          <IonIcon :icon="peopleOutline" aria-hidden="true" />
          {{ t('track.showOthers') }}
        </button>
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

.edit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.edit ion-icon {
  color: var(--jp-action);
  font-size: var(--jp-icon-sm);
}

.edit:disabled {
  opacity: 0.45;
  cursor: default;
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

/* Under the frame button, the same size: the two ways of moving the map. */
.locate {
  position: absolute;
  z-index: 500;
  top: 58px;
  right: 10px;
}

.locate[aria-pressed='true'] {
  color: var(--ct-glacier);
}

.locate-note {
  position: absolute;
  z-index: 500;
  right: 10px;
  bottom: 10px;
  left: 10px;
  margin: 0;
  padding: 6px 10px;
  border-radius: var(--jp-r-sm);
  background: color-mix(in srgb, var(--jp-surface-card) 92%, transparent);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.people {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px 0;
  background: var(--jp-surface-page);
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 4px 12px;
  border: 1px solid var(--ct-surface2);
  border-radius: var(--jp-r-pill);
  background: transparent;
  color: var(--ct-subtext1);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.toggle[aria-pressed='true'] {
  border-color: var(--jp-action);
  background: var(--jp-action);
  color: var(--ct-base);
  font-weight: var(--jp-weight-semibold);
}

.toggle ion-icon {
  font-size: var(--jp-icon-sm);
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
