<script setup lang="ts">
/**
 * Item reference-photo thumbnail (Addendum 3.22, FR-22.1). Resolves the
 * displayable URL through the orchestrator — a plain public URL in Server
 * Mode, an object URL from IndexedDB in Local Mode — and owns that URL's
 * lifecycle so callers (M9 list rows, M5 detail) stay declarative. Renders
 * nothing when the item has no photo.
 */
import { onUnmounted, ref, watch } from 'vue'
import type { MasterItem } from '@/types/domain'
import { useOrchestrator } from '@/composables/useOrchestrator'

const props = withDefaults(defineProps<{ item: MasterItem; size?: number }>(), { size: 40 })

const orchestrator = useOrchestrator()
const url = ref<string | null>(null)

/**
 * The read this mount is currently waiting for.
 *
 * An object URL is the one handle in this client that nothing else holds
 * once the ref has moved past it, so the answer that arrives *second* has to
 * be recognised and revoked rather than assigned. Two arrive routinely: M9
 * renders a thumbnail per row, so a filter keystroke changes the item under
 * a mount whose predecessor is still reading IndexedDB, and scrolling the
 * list unmounts rows mid-read by design.
 */
let generation = 0

function revoke(candidate: string | null) {
  if (candidate?.startsWith('blob:')) URL.revokeObjectURL(candidate)
}

function release() {
  revoke(url.value)
  url.value = null
}

watch(
  () => [props.item.id, props.item.image_hash],
  async () => {
    const mine = ++generation
    release()
    const resolved = await orchestrator.itemImageUrl(props.item)
    if (mine !== generation) {
      revoke(resolved)
      return
    }
    url.value = resolved
  },
  { immediate: true },
)

// The counter moves on unmount too, so a read still in flight is superseded
// rather than assigned to a ref nothing renders any more.
onUnmounted(() => {
  generation++
  release()
})
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
  border-radius: var(--jp-r-sm);
  object-fit: cover;
  flex: none;
  background: var(--ion-color-light);
}
</style>
