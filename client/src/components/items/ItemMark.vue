<script setup lang="ts">
/**
 * The item mark (Addendum §3.28, FR-28.4/28.5) — the one place the fallback
 * ladder is decided, so no screen re-decides it and none forgets that the
 * mark is presentational.
 *
 * The three surfaces fall back differently because they answer different
 * questions:
 *
 *   - `inventory` — photo → mark → the primary tag's initial. M9 is where an
 *     item is identified, the initial tile already exists there (ADR-014),
 *     and a column that never falls back to nothing stays aligned.
 *   - `packing`   — photo → mark → an empty slot that holds its width. No
 *     letter: beside the name it repeats, the rendered round showed it as
 *     noise on a row already carrying a checkbox, quantity, badges and
 *     avatars.
 *   - `plain`     — mark → nothing at all, not even a slot. Templates and
 *     groups (FR-28.8) have no photo and no initial to fall back to.
 *
 * A photo always wins where one exists (FR-22.1): it is the more specific
 * answer, and the item someone photographed is the item whose identity
 * mattered.
 */
import { computed } from 'vue'
import ItemThumbnail from './ItemThumbnail.vue'
import type { MasterItem } from '@/types/domain'

/** The three questions a surface can be asking. */
export type MarkSurface = 'inventory' | 'packing' | 'plain'

const props = withDefaults(
  defineProps<{
    /** The mark itself, absent as often as not — FR-28.1 makes that first-class. */
    mark?: string | null
    surface: MarkSurface
    /**
     * The item whose photo outranks the mark. Omitted where the surface has
     * no photo to offer (a template row), which is not the same as an item
     * that happens to have none.
     */
    photoItem?: MasterItem | null
    /** The `inventory` ladder's last rung; ignored by the other two. */
    initial?: string
    /** The glyph box, in px — a size, never inherited from the text beside it (G-13). */
    size?: number
  }>(),
  { mark: null, photoItem: null, initial: '', size: 22 },
)

const showPhoto = computed(() => Boolean(props.photoItem?.image_hash))
const showMark = computed(() => !showPhoto.value && Boolean(props.mark))
const showInitial = computed(
  () => props.surface === 'inventory' && !showPhoto.value && !showMark.value,
)
/** `packing` keeps the column aligned even with nothing to show; `plain` does not. */
const showSlot = computed(() => showMark.value || props.surface === 'packing')
</script>

<template>
  <ItemThumbnail v-if="showPhoto" :item="photoItem!" :size="size" class="mark-photo" />
  <div
    v-else-if="showInitial"
    class="mark-initial"
    aria-hidden="true"
    data-testid="item-mark-initial"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    {{ initial }}
  </div>
  <span
    v-else-if="showSlot"
    class="mark-slot"
    aria-hidden="true"
    data-testid="item-mark-slot"
    :style="{ width: `${size}px`, height: `${size}px`, '--jp-mark-size': `${size}px` }"
  >
    <span v-if="showMark" class="jp-mark" data-testid="item-mark">{{ mark }}</span>
  </span>
</template>

<style scoped>
.mark-photo,
.mark-initial,
.mark-slot {
  flex: none;
}

.mark-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* ADR-014's tile, moved here with the ladder that decides when it shows. */
.mark-initial {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ion-color-medium);
  font-size: var(--jp-icon-sm);
}
</style>
