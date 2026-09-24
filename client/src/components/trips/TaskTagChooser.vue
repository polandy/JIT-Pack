<script setup lang="ts">
/**
 * FR-7.8's tag choice for tasks — one task's in its sheet, a selection's in
 * the batch sheet (2026-09-24). Drawn once, so choosing a tag for one task
 * and for ten is the same act.
 *
 * „Exactly one" as the owner asked it — at most one, never two. The list is
 * therefore a choice and not a set of toggles, and *no tag* is one of the
 * choices rather than the absence of a choice. A word the list does not have
 * yet is the next tag, created where it is needed.
 */
import { IonButton, IonInput } from '@ionic/vue'
import { ref } from 'vue'

import ItemMark from '@/components/items/ItemMark.vue'
import { t } from '@/i18n'
import type { TaskTag } from '@/types/domain'

/** The size a tag chip wears its mark at (G-15's scale). */
const MARK_SIZE = 15

defineProps<{
  /** The tags a task may carry, in their own order. */
  taskTags: readonly TaskTag[]
  /** The tag that reads as chosen, null for none, undefined for no choice yet (a batch). */
  chosen?: string | null
  /** What *no tag* is called — the task's origin names it (FR-7.8). */
  noTagLabel: string
}>()

const emit = defineEmits<{
  /** This tag, or null for none. */
  tag: [taskTagId: string | null]
  /** A word the list does not have yet. */
  newTag: [name: string]
}>()

const draft = ref('')

function addTag() {
  const name = draft.value.trim()
  if (!name) return
  draft.value = ''
  emit('newTag', name)
}
</script>

<template>
  <div class="tags" data-testid="task-sheet-tags">
    <div class="tags-label jp-section-count">{{ t('tasks.tagLabel') }}</div>
    <button
      v-for="tag in taskTags"
      :key="tag.id"
      type="button"
      class="tag"
      :class="{ on: chosen === tag.id }"
      :data-testid="`task-sheet-tag-${tag.name}`"
      @click="emit('tag', tag.id)"
    >
      <ItemMark v-if="tag.icon" :mark="tag.icon" surface="plain" :size="MARK_SIZE" />{{ tag.name }}
    </button>
    <button
      type="button"
      class="tag"
      :class="{ on: chosen === null }"
      data-testid="task-sheet-tag-none"
      @click="emit('tag', null)"
    >
      {{ noTagLabel }}
    </button>
    <div class="tag-new">
      <IonInput
        v-model="draft"
        :placeholder="t('tasks.newTag')"
        data-testid="task-sheet-tag-input"
        @keydown.enter="addTag"
      />
      <IonButton
        size="small"
        :disabled="!draft.trim()"
        data-testid="task-sheet-tag-add"
        @click="addTag"
      >
        {{ t('common.add') }}
      </IonButton>
    </div>
  </div>
</template>

<style scoped>
/* The tags read as one block of choices, which is what „exactly one" is. */
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 16px 0 0;
}

.tags-label {
  flex: 0 0 100%;
  margin-bottom: 2px;
}

.tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.tag.on {
  border-color: var(--jp-action);
  color: var(--ct-text);
}

.tag-new {
  flex: 0 0 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.tag-new ion-input {
  --background: var(--ct-surface0);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-md);
}
</style>
