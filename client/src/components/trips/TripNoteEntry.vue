<script setup lang="ts">
/**
 * One entry of a trip-note thread (FR-7.13) — the first note or a reply.
 *
 * The words are what a reader came for, so they render in full with a phone
 * number as a `tel:` link (FR-7.9's presentation rule); tapping them opens
 * the entry's sheet, where it can be copied and who has seen it is named.
 * The author edits in place, behind the ✎: only the author, because an
 * entry carries its author's name (question 2). A first note's edit also
 * carries its title.
 */
import { IonButton, IonIcon, IonInput, IonTextarea } from '@ionic/vue'
import { pencilOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import UserAvatar from '@/components/global/UserAvatar.vue'
import { linkifyPhoneNumbers } from '@/domain/noteText'
import { t } from '@/i18n'
import { noteEntryMeta } from '@/lib/noteFacts'
import type { NameOf } from '@/lib/rowFacts'
import type { ItemComment } from '@/types/domain'

const props = defineProps<{
  entry: ItemComment
  /** The thread's first note, which carries the title. */
  first: boolean
  /** Written by somebody else after I last read the thread. */
  unseen: boolean
  /** Mine — the only entries I may edit. */
  mine: boolean
  nameOf: NameOf
}>()

const emit = defineEmits<{
  /** The words were tapped — the screen opens the entry's sheet. */
  open: []
  /** The author saved an edit; `title` only for a first note. */
  save: [body: string, title: string | null | undefined]
}>()

const segments = computed(() => linkifyPhoneNumbers(props.entry.body))
const meta = computed(() => noteEntryMeta(props.entry, props.nameOf))

const editing = ref(false)
const draftBody = ref('')
const draftTitle = ref('')

function startEdit() {
  draftBody.value = props.entry.body
  draftTitle.value = props.entry.title ?? ''
  editing.value = true
}

function save() {
  const body = draftBody.value.trim()
  if (!body) return
  editing.value = false
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
    :class="{ first, unseen }"
    :data-testid="`note-entry-${entry.id}`"
    :data-unseen="unseen ? '' : undefined"
  >
    <UserAvatar
      :name="nameOf(entry.author_id) ?? null"
      :seed="entry.author_id"
      :size="first ? 26 : 22"
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
    <div v-else class="content">
      <button
        type="button"
        class="words"
        :data-testid="`note-entry-open-${entry.id}`"
        @click="emit('open')"
      >
        <template v-for="(seg, i) in segments" :key="i">
          <a v-if="seg.tel" :href="`tel:${seg.tel}`" class="tel" @click.stop>{{ seg.text }}</a>
          <template v-else>{{ seg.text }}</template>
        </template>
      </button>
      <p class="meta">
        <span :data-testid="`note-entry-meta-${entry.id}`">{{ meta }}</span>
        <span v-if="unseen" class="dot" :aria-label="t('notes.new')" />
        <button
          v-if="mine"
          type="button"
          class="edit"
          :aria-label="t('common.edit')"
          :data-testid="`note-entry-edit-${entry.id}`"
          @click="startEdit"
        >
          <IonIcon :icon="pencilOutline" aria-hidden="true" />
          {{ t('common.edit') }}
        </button>
      </p>
    </div>
  </div>
</template>

<style scoped>
.entry {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0 8px 6px;
  /* Always there, so marking an entry unseen moves nothing. */
  border-inline-start: 2px solid transparent;
}

/* A reply sits in from the first note's avatar, one level and no deeper. */
.entry:not(.first) {
  padding-inline-start: 22px;
}

/* Unseen by me: a stroke down the side, the mockup's mark — the badge on
   the thread says how many, this says which. */
.entry.unseen {
  border-inline-start-color: var(--jp-action);
}

.content,
.editor {
  flex: 1;
  min-width: 0;
}

.words {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.first .words {
  font-size: var(--jp-text-md);
}

.tel {
  color: var(--jp-action);
  text-decoration: underline;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 3px 0 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--jp-action);
}

.edit {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0;
  border: none;
  background: none;
  color: var(--ct-subtext0);
  font: inherit;
  cursor: pointer;
}

.edit ion-icon {
  font-size: var(--jp-icon-xs);
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
