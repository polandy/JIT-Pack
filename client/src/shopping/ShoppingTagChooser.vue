<script setup lang="ts">
/**
 * An entry's one tag (FR-30.9) — the shared `TagPicker` (one mask for M6 and
 * M25, owner 2026-09-26), worded for the shopping list. What this adds is
 * the list's side of it: a shopping tag is a word on the entry rather than a
 * row, so a word is its own id, and a new one is normalised as the entry's
 * tag column is.
 *
 * The caller decides what choosing means — the composer's next entry or an
 * entry that exists — so every act is an event.
 */
import { computed } from 'vue'

import TagPicker from '@/components/global/TagPicker.vue'
import { t } from '@/i18n'

import { normalizeTag } from './actions'

const props = withDefaults(
  defineProps<{
    /** The tags in use on the trip. */
    tags: string[]
    /** The tag chosen now; null for none. */
    assigned: string | null
    /**
     * The trailing summary line — off for a bulk choice (FR-30.9): that
     * sheet applies the instant a chip is chosen and never carries one
     * "assigned" tag to summarise.
     */
    summary?: boolean
  }>(),
  { summary: true },
)

const emit = defineEmits<{
  /** A tag to file under — an existing one, or a new name — or null for none. */
  choose: [tag: string | null]
}>()

/** The vocabulary: what is in use, plus the chosen tag even before any entry carries it. */
const pool = computed(() => {
  const names =
    props.assigned && !props.tags.includes(props.assigned)
      ? [...props.tags, props.assigned]
      : props.tags
  return names.map((name) => ({ id: name, name }))
})

const summaryLine = computed(() => {
  if (!props.summary) return null
  return props.assigned
    ? t('shopping.tagFiledUnder', { tag: props.assigned })
    : t('shopping.tagNone')
})

function create(name: string) {
  const tag = normalizeTag(name)
  if (tag !== null) emit('choose', tag)
}
</script>

<template>
  <TagPicker
    :tags="pool"
    :chosen="assigned"
    :summary="summaryLine"
    @choose="emit('choose', $event)"
    @create="create"
  />
</template>
