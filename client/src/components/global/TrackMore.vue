<script setup lang="ts">
/**
 * A track's ⋮ (FR-29.17, FR-29.20): edit its route, rename it, download,
 * replace or remove its file. Kernel — the track card's file line and the
 * full-screen map of an excursion's tracks both carry it; what is chosen is
 * handed up, and the owner writes it.
 */
import { IonIcon, actionSheetController } from '@ionic/vue'
import {
  createOutline,
  downloadOutline,
  ellipsisVertical,
  gitBranchOutline,
  swapHorizontalOutline,
  trashOutline,
} from 'ionicons/icons'
import { ref } from 'vue'

import type { TrackSettings } from '@/domain/track'
import { t } from '@/i18n'
import { promptText } from '@/composables/shared/confirm'
import { useTileState } from '@/composables/shared/mapTiles'
import type { TrackFields } from '@/types/domain'

const props = defineProps<{ track: TrackFields }>()

const emit = defineEmits<{
  update: [track: TrackFields, settings: TrackSettings]
  download: [track: TrackFields]
  replace: [track: TrackFields, file: File]
  remove: [track: TrackFields]
  /** FR-29.20: the track's route is to be edited — the owner loads its file. */
  edit: [track: TrackFields]
}>()

const tiles = useTileState()
const replaceInput = ref<HTMLInputElement | null>(null)

function onReplaceFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // The same file can be picked again after a failed upload.
  input.value = ''
  if (file) emit('replace', props.track, file)
}

async function rename(track: TrackFields) {
  await promptText({
    header: t('track.rename'),
    value: track.name,
    placeholder: t('track.renameLabel'),
    confirmLabel: t('common.save'),
    testid: 'track-rename-prompt',
    onConfirm: (name) => {
      if (name === '') return false
      emit('update', track, { name })
    },
  })
}

async function openMenu() {
  const track = props.track
  const sheet = await actionSheetController.create({
    header: `${track.name} · ${track.file_name}`,
    htmlAttributes: { 'data-testid': 'track-menu' },
    buttons: [
      {
        // Without a map no point can be set: offline, or tiles off on this instance.
        text:
          tiles.value === 'on'
            ? t('track.edit')
            : `${t('track.edit')} – ${t('track.editNeedsMap')}`,
        icon: gitBranchOutline,
        disabled: tiles.value !== 'on',
        htmlAttributes: { 'data-testid': 'track-edit' },
        handler: () => emit('edit', track),
      },
      {
        text: t('track.rename'),
        icon: createOutline,
        htmlAttributes: { 'data-testid': 'track-rename' },
        handler: () => void rename(track),
      },
      {
        text: t('track.download'),
        icon: downloadOutline,
        htmlAttributes: { 'data-testid': 'track-download' },
        handler: () => emit('download', track),
      },
      {
        text: t('track.replace'),
        icon: swapHorizontalOutline,
        htmlAttributes: { 'data-testid': 'track-replace' },
        handler: () => replaceInput.value?.click(),
      },
      {
        text: t('track.remove'),
        icon: trashOutline,
        role: 'destructive',
        htmlAttributes: { 'data-testid': 'track-remove' },
        handler: () => emit('remove', track),
      },
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
}
</script>

<template>
  <button
    type="button"
    class="more"
    :aria-label="t('track.more')"
    data-testid="track-more"
    @click="openMenu"
  >
    <IonIcon :icon="ellipsisVertical" aria-hidden="true" />
  </button>
  <input
    ref="replaceInput"
    type="file"
    accept=".gpx,application/gpx+xml"
    hidden
    data-testid="track-replace-file"
    @change="onReplaceFile"
  />
</template>

<style scoped>
.more {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ct-subtext1);
  cursor: pointer;
}

ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
