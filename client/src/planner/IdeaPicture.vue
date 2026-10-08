<script setup lang="ts">
/**
 * One idea picture (FR-29.5), resolved through the host's picture channel.
 *
 * The URL is the channel's, cached for the session and shared between the
 * board and the open idea, so this mount does not revoke it. Until the bytes
 * are here — or while they cannot be had, offline — the tile shows a glyph
 * on the sunken surface rather than collapsing, so the mosaic keeps its shape.
 */
import { IonIcon } from '@ionic/vue'
import { imageOutline } from 'ionicons/icons'
import { onUnmounted, ref, watch } from 'vue'

import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import type { IdeaImage } from '@/types/domain'

const props = withDefaults(
  defineProps<{
    image: IdeaImage
    alt: string
    /** `contain` shows the whole picture — the viewer's; a tile crops. */
    fit?: 'cover' | 'contain'
  }>(),
  { fit: 'cover' },
)

const pictures = useOrchestrator().moduleHost.pictures
const url = ref<string | null>(null)

// The read this mount waits for: a later picture under the same mount (a
// cover that changed) must not be overwritten by the earlier one's answer.
let generation = 0

watch(
  () => [props.image.id, props.image.image_hash],
  async () => {
    const mine = ++generation
    url.value = null
    const resolved = await pictures.url(props.image)
    if (mine === generation) url.value = resolved
  },
  { immediate: true },
)

onUnmounted(() => generation++)
</script>

<template>
  <span
    class="idea-picture"
    :data-testid="`idea-picture-${image.id}`"
    :data-loaded="url ? 'true' : undefined"
    :data-fit="fit"
  >
    <img v-if="url" :src="url" :alt="alt" />
    <IonIcon v-else :icon="imageOutline" :aria-label="alt" />
  </span>
</template>

<style scoped>
.idea-picture {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--jp-surface-sunken);
  color: var(--ct-overlay1);
}

img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

[data-fit='contain'] {
  background: transparent;
}

[data-fit='contain'] img {
  object-fit: contain;
}

ion-icon {
  font-size: var(--jp-icon-lg);
}
</style>
