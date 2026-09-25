<script setup lang="ts">
/**
 * One thread on M26's list (FR-7.13) — a card that shows what is in it.
 *
 * The notes are looked things up in: a key-box code, the pizza number. So
 * the card carries the first note's words (two lines), not only its name,
 * and the newest reply beside its writer, the way a chat list quotes the
 * last message. *Neu* is a badge on the name. The whole card is one button
 * into the thread; seeing is said there, with a labelled control, not with
 * a checkbox here that read as *done* one pill from the tasks.
 */
import { computed } from 'vue'

import NoteText from '@/components/trips/NoteText.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { latestReply, threadName, type NoteThread } from '@/domain/tripNotes'
import { t } from '@/i18n'
import { noteThreadMeta } from '@/lib/noteFacts'
import type { NameOf } from '@/lib/rowFacts'

const props = defineProps<{
  thread: NoteThread
  nameOf: NameOf
}>()

const emit = defineEmits<{ open: [] }>()

const root = computed(() => props.thread.root)
const name = computed(() => threadName(root.value))
/**
 * What the card quotes under the name: the whole first note under a title;
 * without one the first line is the name already, so only what follows it.
 */
const preview = computed(() => {
  if (root.value.title?.trim()) return root.value.body
  return root.value.body.split('\n').slice(1).join('\n').trim()
})
const last = computed(() => latestReply(props.thread))
const newCount = computed(() => props.thread.unseen.length)
const meta = computed(() => noteThreadMeta(props.thread, props.nameOf))
</script>

<template>
  <button
    type="button"
    class="card jp-card"
    :class="{ new: newCount > 0 }"
    :data-testid="`note-thread-${root.id}`"
    :data-new="newCount > 0 ? '' : undefined"
    @click="emit('open')"
  >
    <UserAvatar :name="nameOf(root.author_id) ?? null" :seed="root.author_id" :size="30" />
    <span class="main">
      <span class="name" :class="{ untitled: !root.title }">
        <span v-if="newCount > 0" class="new-badge" data-testid="note-thread-new">{{
          newCount > 1 ? t('notes.newCount', { n: newCount }) : t('notes.new')
        }}</span>
        <span data-testid="note-thread-name">{{ name }}</span>
      </span>
      <span v-if="preview" class="preview" data-testid="note-thread-preview">
        <NoteText :body="preview" :live="false" />
      </span>
      <span v-if="last" class="last" data-testid="note-thread-last">
        <UserAvatar :name="nameOf(last.author_id) ?? null" :seed="last.author_id" :size="18" />
        <span class="last-text">
          <b v-if="nameOf(last.author_id)">{{ nameOf(last.author_id) }}:</b>
          {{ last.body }}
        </span>
      </span>
      <span class="meta" data-testid="note-thread-meta">{{ meta }}</span>
    </span>
  </button>
</template>

<style scoped>
.card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: calc(100% - 24px);
  margin: 0 12px 10px;
  padding: 12px;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

/* New for me: the card's edge takes the *neu* colour, quietly — the badge
   says it in words. */
.card.new {
  border-color: color-mix(in srgb, var(--jp-action) 55%, var(--jp-surface-border));
}

.main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.name {
  overflow: hidden;
  color: var(--ct-text);
  font-weight: var(--jp-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The first line standing in for a title reads as words, not as a heading. */
.name.untitled {
  font-weight: var(--jp-weight-medium);
}

.new-badge {
  display: inline-block;
  margin-inline-end: 6px;
  padding: 1px 7px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-action);
  color: var(--ct-base);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
  vertical-align: middle;
}

.preview {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-base);
  white-space: pre-line;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.last {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  padding-top: 7px;
  border-top: 1px solid var(--ct-surface0);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.last-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.last-text b {
  color: var(--ct-subtext1);
  font-weight: var(--jp-weight-semibold);
}

.meta {
  margin-top: 2px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}
</style>
