<script setup lang="ts">
/**
 * One entry of a trip-note thread (FR-7.13) on the thread view — the first
 * note as a card, a reply as a bubble, mine on the other side.
 *
 * The words render in full, with a phone number as a `tel:` link and a code
 * as a chip that copies (`NoteText`). Tapping the entry anywhere else opens
 * its menu — copy, edit, delete — so no action has to stand under every
 * entry. The author edits in place once the menu says so: only the author,
 * because an entry carries its author's name (question 2). A first note's
 * edit also carries its title and the excursion the thread is about
 * (FR-7.15), which it names under its words as a way into that excursion.
 */
import { IonButton, IonIcon, IonInput, IonTextarea } from '@ionic/vue'
import { ellipsisHorizontal } from 'ionicons/icons'
import { computed, ref } from 'vue'

import NoteExcursionChips from '@/components/trips/NoteExcursionChips.vue'
import NoteExcursionTag from '@/components/trips/NoteExcursionTag.vue'
import NoteText from '@/components/trips/NoteText.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { t } from '@/i18n'
import { noteEntryMeta } from '@/lib/noteFacts'
import type { NameOf } from '@/lib/rowFacts'
import type { Excursion, ItemComment } from '@/types/domain'

const props = defineProps<{
  entry: ItemComment
  /** The thread's first note, which carries the title and stands as a card. */
  first: boolean
  /** Written by somebody else after I last read the thread. */
  unseen: boolean
  /** Mine — on the other side, and the only entries I may edit. */
  mine: boolean
  /** A first note's „gesehen von" line; empty says nothing. */
  seenBy?: readonly string[]
  /** FR-7.15, a first note's: the excursion the thread is about, or null. */
  excursion?: Excursion | null
  /** FR-7.15, a first note's: what its author may name while editing. */
  excursions?: readonly Excursion[]
  nameOf: NameOf
}>()

const emit = defineEmits<{
  /** The entry was tapped — the screen opens its menu. */
  menu: []
  /** The author saved an edit; `title` only for a first note. */
  save: [body: string, title: string | null | undefined]
  /** FR-7.15: the author named another excursion, or none. */
  link: [excursionId: string | null]
  /** FR-7.15: the excursion's name was tapped. */
  openExcursion: []
}>()

const meta = computed(() => noteEntryMeta(props.entry, props.nameOf))
const author = computed(() => props.nameOf(props.entry.author_id) ?? null)

const editing = ref(false)
const draftBody = ref('')
const draftTitle = ref('')
const draftExcursion = ref<string | null>(null)

/** The excursions the editor offers: a first note's, where the trip has any. */
const offered = computed(() => (props.first ? (props.excursions ?? []) : []))

function startEdit() {
  draftBody.value = props.entry.body
  draftTitle.value = props.entry.title ?? ''
  draftExcursion.value = props.excursion?.id ?? null
  editing.value = true
}

/**
 * The words and the excursion leave as two writes: an edit of the words is
 * stamped and makes the thread new for its readers, a new excursion is not.
 */
function save() {
  const body = draftBody.value.trim()
  if (!body) return
  editing.value = false
  if (props.first && draftExcursion.value !== (props.excursion?.id ?? null)) {
    emit('link', draftExcursion.value)
  }
  const title = props.first ? draftTitle.value.trim() || null : undefined
  if (body === props.entry.body && (title === undefined || title === (props.entry.title ?? null))) {
    return
  }
  emit('save', body, title)
}

defineExpose({ startEdit })
</script>

<template>
  <div
    class="entry"
    :class="{ first, mine: mine && !first, unseen }"
    :data-testid="`note-entry-${entry.id}`"
    :data-unseen="unseen ? '' : undefined"
  >
    <UserAvatar
      v-if="first || !mine"
      :name="author"
      :seed="entry.author_id"
      :size="first ? 28 : 22"
    />
    <div v-if="editing" class="editor" :data-testid="`note-entry-editor-${entry.id}`">
      <IonInput
        v-if="first"
        v-model="draftTitle"
        :placeholder="t('notes.titlePlaceholder')"
        :aria-label="t('notes.titlePlaceholder')"
        data-testid="note-edit-title"
      />
      <IonTextarea
        v-model="draftBody"
        auto-grow
        :rows="2"
        :aria-label="t('common.edit')"
        data-testid="note-edit-body"
      />
      <NoteExcursionChips
        v-if="offered.length > 0"
        v-model="draftExcursion"
        class="editor-excursions"
        :excursions="offered"
      />
      <div class="editor-actions">
        <IonButton
          fill="clear"
          size="small"
          data-testid="note-edit-cancel"
          @click="editing = false"
        >
          {{ t('common.cancel') }}
        </IonButton>
        <IonButton
          size="small"
          :disabled="!draftBody.trim()"
          data-testid="note-edit-save"
          @click="save"
        >
          {{ t('common.save') }}
        </IonButton>
      </div>
    </div>
    <div v-else class="stack">
      <div
        class="content"
        role="button"
        tabindex="0"
        :aria-label="t('notes.more')"
        :data-testid="`note-entry-open-${entry.id}`"
        @click="emit('menu')"
        @keydown.enter.self="emit('menu')"
      >
        <p v-if="first || !mine" class="who">
          <span :data-testid="`note-entry-meta-${entry.id}`">{{ meta }}</span>
          <IonIcon v-if="first" class="more" :icon="ellipsisHorizontal" aria-hidden="true" />
        </p>
        <p class="words" :data-testid="`note-entry-words-${entry.id}`">
          <NoteText :body="entry.body" :live="true" />
        </p>
        <p v-if="!first && mine" class="when" :data-testid="`note-entry-meta-${entry.id}`">
          {{ meta }}
        </p>
        <p v-if="seenBy && seenBy.length > 0" class="seen" data-testid="note-entry-seen-by">
          {{ t('notes.seenBy', { names: seenBy.join(', ') }) }}
        </p>
      </div>
      <!-- Beside the entry's own button rather than in it: a way somewhere
         else is not a way into this entry's menu. -->
      <NoteExcursionTag
        v-if="first && excursion"
        :excursion="excursion"
        link
        @open="emit('openExcursion')"
      />
    </div>
  </div>
</template>

<style scoped>
.entry {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 0 12px;
}

.entry.mine {
  justify-content: flex-end;
}

/* The first note is the reference the thread is about: a card, on top. */
.entry.first {
  align-items: flex-start;
  gap: 10px;
  margin: 12px 12px 6px;
  padding: 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r);
  background: var(--jp-surface-card);
}

/* A whole thread new for me: its card says so at the edge, the list's mark. */
.entry.first.unseen {
  border-color: color-mix(in srgb, var(--jp-action) 55%, var(--jp-surface-border));
}

.content,
.editor,
.stack {
  min-width: 0;
}

.first .stack,
.first .editor,
.editor {
  flex: 1;
}

/* A first note stacks its words over the excursion it is about; a reply's
   bubble keeps sitting in the row as if nothing wrapped it. */
.first .stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entry:not(.first) .stack {
  display: contents;
}

.editor-excursions {
  margin-bottom: 8px;
}

.content {
  cursor: pointer;
}

/* A reply is a bubble; mine takes the action colour, faintly, like a sent message. */
.entry:not(.first) .content {
  max-width: 80%;
  padding: 7px 11px;
  border-radius: var(--jp-r-md) var(--jp-r-md) var(--jp-r-md) var(--jp-r-xs);
  background: var(--jp-surface-card);
}

.entry.mine .content {
  border-radius: var(--jp-r-md) var(--jp-r-md) var(--jp-r-xs) var(--jp-r-md);
  background: color-mix(in srgb, var(--jp-action) 22%, var(--jp-surface-card));
}

.who,
.when,
.seen {
  margin: 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.who {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.when {
  margin-top: 2px;
  text-align: end;
}

.seen {
  margin-top: 8px;
}

.more {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-sm);
}

.words {
  margin: 2px 0 0;
  color: var(--ct-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.first .words {
  margin-top: 6px;
  font-size: var(--jp-text-md);
}

.editor ion-input,
.editor ion-textarea {
  --background: var(--jp-surface-sunken);
  --padding-start: 10px;
  --padding-end: 10px;
  margin-bottom: 6px;
  border-radius: var(--jp-r-md);
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
</style>
