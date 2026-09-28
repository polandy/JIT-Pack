<script setup lang="ts">
/**
 * An idea's pictures one at a time, whole (FR-29.5): opened from a mosaic
 * tile, paged by swipe, the arrows or the keyboard. It is also where a
 * picture is made the cover or removed — the two things done *to* a
 * picture, which the mosaic leaves to a look first.
 */
import { IonButton, IonIcon, IonModal } from '@ionic/vue'
import { chevronBack, chevronForward, close, starOutline, trashOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import { t } from '@/i18n'
import type { IdeaImage } from '@/types/domain'
import IdeaPicture from './IdeaPicture.vue'

/** How far a finger travels sideways before it pages rather than taps. */
const SWIPE_PX = 48

const props = defineProps<{
  pictures: IdeaImage[]
  title: string
  /** The picture to open on, or null while the viewer is closed. */
  start: number | null
}>()

const emit = defineEmits<{
  close: []
  cover: [image: IdeaImage]
  remove: [image: IdeaImage]
}>()

const index = ref(0)

watch(
  () => props.start,
  (start) => {
    if (start !== null) index.value = start
  },
  { immediate: true },
)

// A removed picture shortens the list under the viewer: stay on the one
// that took its place, and close once none is left.
watch(
  () => props.pictures.length,
  (length) => {
    if (props.start === null) return
    if (length === 0) emit('close')
    else if (index.value >= length) index.value = length - 1
  },
)

const current = computed(() => props.pictures[index.value] ?? null)
const isCover = computed(() => index.value === 0)

function page(step: number) {
  const length = props.pictures.length
  if (length > 1) index.value = (index.value + step + length) % length
}

let downX: number | null = null

function onPointerDown(event: PointerEvent) {
  downX = event.clientX
}

function onPointerUp(event: PointerEvent) {
  if (downX === null) return
  const dx = event.clientX - downX
  downX = null
  if (Math.abs(dx) >= SWIPE_PX) page(dx < 0 ? 1 : -1)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') page(-1)
  else if (event.key === 'ArrowRight') page(1)
}
</script>

<template>
  <IonModal
    :is-open="start !== null"
    class="picture-viewer"
    data-testid="idea-viewer"
    @did-dismiss="emit('close')"
  >
    <div class="viewer" tabindex="-1" @keydown="onKey">
      <header class="bar">
        <span class="count jp-num" data-testid="idea-viewer-count">
          {{ t('ideas.pictureOf', { n: index + 1, total: pictures.length }) }}
        </span>
        <span v-if="isCover" class="cover-badge" data-testid="idea-viewer-cover">
          {{ t('ideas.isCover') }}
        </span>
        <button
          type="button"
          class="icon-button close"
          :aria-label="t('common.close')"
          data-testid="idea-viewer-close"
          @click="emit('close')"
        >
          <IonIcon :icon="close" aria-hidden="true" />
        </button>
      </header>

      <div
        class="stage"
        data-testid="idea-viewer-stage"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @pointercancel="downX = null"
      >
        <IdeaPicture
          v-if="current"
          :key="current.id"
          :image="current"
          fit="contain"
          :alt="t('ideas.pictureAlt', { n: index + 1, title })"
        />
        <template v-if="pictures.length > 1">
          <button
            type="button"
            class="icon-button pager prev"
            :aria-label="t('ideas.previousPicture')"
            data-testid="idea-viewer-prev"
            @click="page(-1)"
          >
            <IonIcon :icon="chevronBack" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="icon-button pager next"
            :aria-label="t('ideas.nextPicture')"
            data-testid="idea-viewer-next"
            @click="page(1)"
          >
            <IonIcon :icon="chevronForward" aria-hidden="true" />
          </button>
        </template>
      </div>

      <footer v-if="current" class="bar actions">
        <IonButton
          v-if="!isCover"
          fill="clear"
          data-testid="idea-viewer-make-cover"
          @click="emit('cover', current)"
        >
          <IonIcon slot="start" :icon="starOutline" />
          {{ t('ideas.makeCover') }}
        </IonButton>
        <IonButton
          fill="clear"
          color="danger"
          data-testid="idea-viewer-remove"
          @click="emit('remove', current)"
        >
          <IonIcon slot="start" :icon="trashOutline" />
          {{ t('ideas.removePicture') }}
        </IonButton>
      </footer>
    </div>
  </IonModal>
</template>

<style scoped>
.picture-viewer {
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
  outline: none;
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}

.count {
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.cover-badge {
  padding: 1px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--jp-brand);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.close {
  margin-inline-start: auto;
}

.stage {
  position: relative;
  flex: 1;
  min-height: 0;
  touch-action: pan-y;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ct-surface0) 70%, transparent);
  color: var(--ct-text);
  cursor: pointer;
}

.icon-button ion-icon {
  font-size: var(--jp-icon-md);
}

.pager {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}

.prev {
  left: 10px;
}

.next {
  right: 10px;
}

.actions {
  justify-content: center;
}
</style>
