<script setup lang="ts">
/**
 * The round ✕ that takes a row off a list — a preparation task, a Vorlage
 * group, a position, a trip task (component extraction worklist item 1,
 * owner 2026-09-22).
 *
 * It was the same button, icon and CSS block written out seven times across
 * three files, none of them with any press feedback — a tap landed with no
 * visible acknowledgement. One size now (30px, the majority's own number;
 * the one 28px call site gains two pixels nobody will notice) and one
 * `:hover`/`:active`/`:focus-visible` treatment, decided once here instead
 * of never, in seven places.
 *
 * `data-testid` is not a prop: with one root element it falls through to the
 * button, which is where a case looking for it wants it (the pattern
 * `SectionHead.vue` also uses).
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'

withDefaults(
  defineProps<{
    /** What the button does, read by a screen reader — the caller's word. */
    label: string
    /** Almost always the ✕; a call site can ask for a different glyph. */
    icon?: string
  }>(),
  { icon: closeOutline },
)

defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button type="button" class="rm" :aria-label="label" @click="$emit('click', $event)">
    <IonIcon :icon="icon" />
  </button>
</template>

<style scoped>
.rm {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.rm:hover {
  background: var(--ct-surface0);
}

.rm:active {
  background: var(--ct-surface1);
}

.rm:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 1px;
}
</style>
