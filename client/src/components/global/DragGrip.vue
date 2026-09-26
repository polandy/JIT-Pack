<script setup lang="ts">
/**
 * The grip at a row's leading edge that exists only to be dragged — M6's
 * single-row retag (FR-30.9) and M25's tasks between tags and phases
 * (FR-7.8). One component draws both, so the two cannot drift apart.
 *
 * `off` is the refusal: a row that cannot be dragged still holds the grip's
 * place with a dashed ring, since an empty gap there reads as broken rather
 * than absent.
 *
 * The caller's `slot`, `data-testid` and `@pointerdown.stop` fall through to
 * the one root element, which is where the gesture has to start — an emit
 * would arrive after the browser has already decided the press is a scroll.
 */
import { IonIcon } from '@ionic/vue'
import { reorderThreeOutline } from 'ionicons/icons'

defineProps<{
  /** What dragging the row does, read by a screen reader. Unused when `off`. */
  label?: string
  /** A row with nothing to drag: the dashed placeholder instead of the glyph. */
  off?: boolean
}>()
</script>

<template>
  <span v-if="off" class="drag-grip off" aria-hidden="true"></span>
  <span v-else class="drag-grip" :aria-label="label">
    <IonIcon :icon="reorderThreeOutline" aria-hidden="true" />
  </span>
</template>

<style scoped>
/* A full 44px target pulled into the item's start padding, so the glyph sits
   on the leading edge — `touch-action: none` unconditionally, since grabbing
   it always means the drag, never a list scroll. */
.drag-grip {
  width: 44px;
  height: 44px;
  flex: none;
  display: grid;
  place-items: center;
  margin-inline-start: -12px;
  color: var(--ct-subtext0);
  cursor: grab;
  touch-action: none;
}

.drag-grip.off {
  cursor: default;
}

/* The selection checkbox's own dashed language for the same refusal
   (`.rowbox.off` in M6), at the grip's size. */
.drag-grip.off::after {
  content: '';
  width: 20px;
  height: 20px;
  border: 1.5px dashed var(--ct-surface2);
  border-radius: var(--jp-r-pill);
  opacity: 0.5;
}
</style>
