<script setup lang="ts">
/**
 * FR-7.15: the notes about an excursion, on its own list — one quiet line
 * per thread, the notes view's glyph and the thread's name, each a way into
 * the thread. Only the names: the words are read on M26, and a list being
 * packed is not the place to read them (the reason notes left M4, FR-7.9).
 */
import { IonIcon } from '@ionic/vue'
import { chatbubblesOutline, chevronForward } from 'ionicons/icons'

import { threadName, type NoteThread } from '@/domain/tripNotes'
import { t } from '@/i18n'

defineProps<{ threads: readonly NoteThread[] }>()

const emit = defineEmits<{ open: [threadId: string] }>()
</script>

<template>
  <section class="excursion-notes" :aria-label="t('excursions.notes')" data-testid="m27-notes">
    <button
      v-for="thread in threads"
      :key="thread.root.id"
      type="button"
      class="note-line"
      :data-testid="`m27-note-${thread.root.id}`"
      @click="emit('open', thread.root.id)"
    >
      <IonIcon class="glyph" :icon="chatbubblesOutline" aria-hidden="true" />
      <span class="name">{{ threadName(thread.root) }}</span>
      <IonIcon class="chevron" :icon="chevronForward" aria-hidden="true" />
    </button>
  </section>
</template>

<style scoped>
.excursion-notes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 12px 8px;
}

.note-line {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 4px;
  border: none;
  background: none;
  color: var(--ct-subtext1);
  font: inherit;
  font-size: var(--jp-text-sm);
  text-align: start;
  cursor: pointer;
}

.note-line:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
  border-radius: var(--jp-r-sm);
}

.glyph {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-sm);
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-xs);
}
</style>
