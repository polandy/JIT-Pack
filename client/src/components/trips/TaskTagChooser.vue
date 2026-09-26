<script setup lang="ts">
/**
 * FR-7.8's tag choice for tasks — the composer's sheet, one task's sheet and
 * a selection's batch sheet. Drawn once, so choosing a tag for one task and
 * for ten is the same act.
 *
 * **M6's mask** (owner, 2026-09-26: the dialog must be the shopping list's):
 * a search field, the chosen tag as a chip with its ✕, the matching tags as
 * chips, and — for a word no tag carries — a dashed *anlegen* chip. The
 * matching rule is the shared one (`lib/itemEditorOffers.ts`), so the two
 * lists cannot disagree on what counts as „already exists". It stays its own
 * component because a task tag is a master row with an id and a mark, a
 * shopping tag a word on the entry — and the shopping module is not imported
 * from here (ADR-066).
 *
 * „Exactly one" as the owner asked it — at most one, never two.
 */
import { IonIcon, IonSearchbar } from '@ionic/vue'
import { addOutline, closeOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import { t } from '@/i18n'
import { tagOffer } from '@/lib/itemEditorOffers'
import type { TaskTag } from '@/types/domain'

const props = defineProps<{
  /** The tags a task may carry, in their own order. */
  taskTags: readonly TaskTag[]
  /** The tag chosen now, null for none, undefined for no choice yet (a batch). */
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

const query = ref('')

const assigned = computed(() => props.taskTags.find((tag) => tag.id === props.chosen) ?? null)

/** A batch has no one tag to summarise, and no ✕ to untag it with — so *no tag* is a chip there. */
const batch = computed(() => props.chosen === undefined)

const offer = computed(() =>
  tagOffer([...props.taskTags], new Set(assigned.value ? [assigned.value.id] : []), query.value),
)

/** Filter-or-create: a name that exists is chosen, one that does not is made. */
function commitQuery() {
  const name = query.value.trim()
  if (!name) return
  const existing = props.taskTags.find((tag) => tag.name.toLowerCase() === name.toLowerCase())
  if (existing) emit('tag', existing.id)
  else emit('newTag', name)
  query.value = ''
}
</script>

<template>
  <div class="tag-chooser" data-testid="task-sheet-tags">
    <IonSearchbar
      :value="query"
      data-testid="task-tag-search"
      :placeholder="t('tasks.tagSearchPlaceholder')"
      :debounce="0"
      @ionInput="(e: CustomEvent) => (query = (e.detail.value as string) ?? '')"
      @keyup.enter="commitQuery"
    />

    <div class="chips">
      <!-- The chosen tag first and always visible, with the one act it offers. -->
      <span v-if="assigned" class="chip assigned">
        <span class="chip-name">
          {{ assigned.name }}
        </span>
        <button
          type="button"
          class="chip-drop"
          :aria-label="t('tasks.tagUnassign', { tag: assigned.name })"
          :data-testid="`task-tag-assigned-${assigned.name}`"
          @click="emit('tag', null)"
        >
          <IonIcon :icon="closeOutline" />
        </button>
      </span>

      <button
        v-for="tag in offer.matches"
        :key="tag.id"
        type="button"
        class="chip"
        :data-testid="`task-tag-${tag.name}`"
        @click="emit('tag', tag.id)"
      >
        {{ tag.name }}
      </button>

      <button
        v-if="batch && !query.trim()"
        type="button"
        class="chip"
        data-testid="task-tag-none"
        @click="emit('tag', null)"
      >
        {{ noTagLabel }}
      </button>

      <button
        v-if="offer.canCreate"
        type="button"
        class="chip create"
        data-testid="task-tag-create"
        @click="commitQuery"
      >
        <IonIcon :icon="addOutline" />
        {{ t('tasks.tagCreate', { name: query.trim() }) }}
      </button>
    </div>

    <p v-if="!batch" class="tag-summary" data-testid="task-tag-summary">
      {{
        assigned
          ? t('tasks.tagFiledUnder', { tag: assigned.name })
          : t('tasks.tagNone', { group: noTagLabel })
      }}
    </p>
  </div>
</template>

<style scoped>
/* M6's chooser, chip for chip (ShoppingTagChooser.vue). */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 11px;
  border: 1px solid var(--ion-color-step-150);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.chip.assigned {
  padding: 0;
  gap: 0;
  cursor: default;
}

.chip.assigned .chip-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 4px 5px 10px;
  color: var(--ct-text);
}

.chip.assigned .chip-drop {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px 5px 4px;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
}

.chip.create {
  border-style: dashed;
  color: var(--jp-brand);
}

.tag-summary {
  margin: 4px 0 12px;
  color: var(--ion-color-medium);
  font-size: var(--jp-text-xs);
}
</style>
