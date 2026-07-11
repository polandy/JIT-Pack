<script setup lang="ts">
/**
 * Item reference-photo thumbnail (Addendum 3.22, FR-22.1). Resolves the
 * displayable URL through the orchestrator — a plain public URL in Server
 * Mode, an object URL from IndexedDB in Local Mode — and owns that URL's
 * lifecycle so callers (M9 list rows, M5 detail) stay declarative. Renders
 * nothing when the item has no photo.
 */
import { inject, onUnmounted, ref, watch } from 'vue'
import type { MasterItem } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = withDefaults(defineProps<{ item: MasterItem; size?: number }>(), { size: 40 })

const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const url = ref<string | null>(null)

function release() {
  if (url.value?.startsWith('blob:')) URL.revokeObjectURL(url.value)
  url.value = null
}

watch(
  () => [props.item.id, props.item.image_hash],
  async () => {
    release()
    url.value = await orchestrator.itemImageUrl(props.item)
  },
  { immediate: true },
)

onUnmounted(release)
</script>

<template>
  <img
    v-if="url"
    :src="url"
    alt=""
    class="item-thumbnail"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
</template>

<style scoped>
.item-thumbnail {
  border-radius: 8px;
  object-fit: cover;
  flex: none;
  background: var(--ion-color-light);
}
</style>
