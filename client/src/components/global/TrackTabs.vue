<script setup lang="ts">
/**
 * A chip per track (FR-29.17): its kind's glyph in its line's colour and
 * its name, the chosen one pressed — a single track's chip is its name.
 * Scrolls sideways and keeps the chosen chip in view.
 */
import { IonIcon } from '@ionic/vue'
import { bicycleOutline, walkOutline } from 'ionicons/icons'
import { nextTick, ref, watch } from 'vue'

import type { TrackFields } from '@/types/domain'
import type { MapLine } from '@/lib/trackColors'

const props = defineProps<{ tracks: TrackFields[]; lines: MapLine[] }>()
const emit = defineEmits<{ choose: [id: string] }>()

const row = ref<HTMLElement | null>(null)

function hueOf(id: string): string {
  return props.lines.find((line) => line.id === id)?.hueClass ?? ''
}

function isChosen(id: string): boolean {
  return props.lines.find((line) => line.id === id)?.chosen ?? false
}

watch(
  () => props.lines.find((line) => line.chosen)?.id,
  async (id) => {
    await nextTick()
    const chip = row.value?.querySelector<HTMLElement>(`[data-track="${id}"]`)
    // Sideways only: scrolling the chip into view would also scroll the
    // sheet around it down to the chips.
    if (row.value && chip) {
      row.value.scrollLeft = chip.offsetLeft - (row.value.clientWidth - chip.clientWidth) / 2
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="tracks.length > 0" ref="row" class="tabs">
    <button
      v-for="track in tracks"
      :key="track.id"
      type="button"
      class="tab"
      :class="hueOf(track.id)"
      :data-track="track.id"
      :aria-pressed="isChosen(track.id) ? 'true' : 'false'"
      :data-testid="`track-tab-${track.id}`"
      @click="emit('choose', track.id)"
    >
      <IonIcon :icon="track.kind === 'bike' ? bicycleOutline : walkOutline" aria-hidden="true" />
      <span class="name">{{ track.name }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  position: relative;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.tab {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  max-width: 70%;
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  color: var(--ct-subtext1);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.tab[aria-pressed='true'] {
  border-color: currentColor;
  color: var(--ct-text);
  font-weight: var(--jp-weight-semibold);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

ion-icon {
  flex: none;
  font-size: var(--jp-icon-sm);
}

.jp-track-larch ion-icon,
.jp-track-larch[aria-pressed='true'] {
  color: var(--ct-larch);
}

.jp-track-glacier ion-icon,
.jp-track-glacier[aria-pressed='true'] {
  color: var(--ct-glacier);
}

.jp-track-heather ion-icon,
.jp-track-heather[aria-pressed='true'] {
  color: var(--ct-heather);
}

.jp-track-alpenrose ion-icon,
.jp-track-alpenrose[aria-pressed='true'] {
  color: var(--ct-alpenrose);
}

.jp-track-pine ion-icon,
.jp-track-pine[aria-pressed='true'] {
  color: var(--ct-pine);
}
</style>
