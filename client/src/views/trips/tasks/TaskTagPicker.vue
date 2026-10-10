<script setup lang="ts">
/**
 * FR-7.8's tag choice for tasks — the composer's sheet, one task's sheet and
 * a selection's batch sheet: the shared `TagPicker` (M6's mask), worded for
 * a task. What this adds is the task's side of it: a
 * tag is a row with an id, and *no tag* is named after the group the task
 * would stand in (FR-7.8).
 *
 * At most one tag per task, never two.
 */
import { computed } from 'vue'

import TagPicker from '@/components/global/TagPicker.vue'
import { t } from '@/i18n'
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

/** A batch has no one tag to summarise and no ✕ to untag with — so *no tag* is a chip there. */
const batch = computed(() => props.chosen === undefined)

const summary = computed(() => {
  if (batch.value) return null
  const assigned = props.taskTags.find((tag) => tag.id === props.chosen)
  return assigned
    ? t('tasks.tagFiledUnder', { tag: assigned.name })
    : t('tasks.tagNone', { group: props.noTagLabel })
})
</script>

<template>
  <TagPicker
    :tags="taskTags"
    :chosen="chosen"
    :summary="summary"
    :no-tag-label="batch ? noTagLabel : undefined"
    @choose="emit('tag', $event)"
    @create="emit('newTag', $event)"
  />
</template>
