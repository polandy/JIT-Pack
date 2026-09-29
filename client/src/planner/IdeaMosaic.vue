<script setup lang="ts">
/**
 * An open idea's pictures as a mosaic (FR-29.5, M28): the cover large on the
 * left, the next two stacked beside it. A fourth picture is not a fourth
 * tile — the third says how many more there are, and the viewer shows all.
 * One picture fills the width; two share it.
 */
import { computed } from 'vue'

import { t } from '@/i18n'
import type { IdeaImage } from '@/types/domain'
import IdeaPicture from './IdeaPicture.vue'

/** How many tiles the mosaic draws; the rest are the viewer's. */
const TILES = 3

const props = defineProps<{ pictures: IdeaImage[]; title: string }>()
const emit = defineEmits<{ open: [index: number] }>()

const tiles = computed(() => props.pictures.slice(0, TILES))
const hidden = computed(() => props.pictures.length - tiles.value.length)
</script>

<template>
  <div class="mosaic" :data-count="tiles.length" data-testid="idea-mosaic">
    <button
      v-for="(image, index) in tiles"
      :key="image.id"
      type="button"
      class="tile"
      :aria-label="t('ideas.pictureOf', { n: index + 1, total: pictures.length })"
      :data-testid="`idea-mosaic-tile-${index}`"
      @click="emit('open', index)"
    >
      <IdeaPicture :image="image" :alt="t('ideas.pictureAlt', { n: index + 1, title })" />
      <span
        v-if="hidden > 0 && index === tiles.length - 1"
        class="more jp-num"
        data-testid="idea-mosaic-more"
      >
        {{ t('ideas.morePictures', { n: hidden }) }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.mosaic {
  display: grid;
  gap: 3px;
  aspect-ratio: 16 / 10;
  max-width: 100%;
  overflow: hidden;
  border-radius: var(--jp-r-md);
}

.mosaic[data-count='2'] {
  grid-template-columns: 2fr 1fr;
}

.mosaic[data-count='3'] {
  grid-template-columns: 2fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.mosaic[data-count='3'] .tile:first-child {
  grid-row: span 2;
}

.tile {
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
}

.tile:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}

.more {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--ct-crust) 55%, transparent);
  color: var(--ct-text);
  font-weight: var(--jp-weight-semibold);
}
</style>
