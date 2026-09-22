<script setup lang="ts">
/**
 * The trip's notes (FR-7.9) — M25's second segment. A note is read by every
 * traveller; new ones (written by somebody else, not yet ticked) sit first
 * and are marked, a note I have ticked sinks below and is muted, and my own
 * notes never carry a tick at all (decision 4) — a tick on your own words
 * would say nothing.
 *
 * Writing lives here, the same way `TripTodoList.vue`'s composer writes
 * directly: the trip is where a note is written (owner, 2026-09-18, carried
 * over from FR-7.4), a screen away from the dashboard that only reports.
 */
import { IonButton, IonCheckbox, IonTextarea } from '@ionic/vue'
import { computed, ref } from 'vue'

import UserAvatar from '@/components/global/UserAvatar.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { myAckFor, tripNoteRows } from '@/domain/tripNotes'
import { t } from '@/i18n'
import { createdStampText } from '@/lib/taskFacts'
import type { NameOf } from '@/lib/rowFacts'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { ItemComment, NoteAck } from '@/types/domain'

const props = defineProps<{
  tripId: string
  /** Every trip-level comment (`is_task = 0`), i.e. every note (FR-7.1). */
  notes: readonly ItemComment[]
  /** Every tick of the trip's notes — every reader's, not only mine. */
  acks: readonly NoteAck[]
  /** Null in Single-User/Local Mode (G-8): no tick is ever this device's own. */
  myUserId: string | null
  nameOf?: NameOf
}>()

const emit = defineEmits<{
  /** A note was written — its id, for the undo that takes it out again. */
  added: [id: string, body: string]
  /** The words were tapped — the screen opens the note's own sheet. */
  open: [note: ItemComment]
}>()

const orchestrator = useOrchestrator()

const rows = computed(() => tripNoteRows(props.notes, props.acks, props.myUserId))

function isMine(note: ItemComment): boolean {
  return props.myUserId !== null && note.author_id === props.myUserId
}

/** A tick renders only where there is somebody to tell apart (decision 4). */
function tickable(note: ItemComment): boolean {
  return props.myUserId !== null && !isMine(note)
}

function stamp(note: ItemComment): string | null {
  // createdStampText reads only created_at/author_id, but its TaskStamps
  // parameter carries a task's resolution too — nulled out here, a note has
  // none.
  return createdStampText(
    { ...note, resolved_at: null, resolved_by_user_id: null },
    props.nameOf ?? (() => null),
  )
}

function onTick(note: ItemComment) {
  orchestrator.toggleNoteTick(
    props.tripId,
    note.id,
    CLIENT_ACTOR_PLACEHOLDER,
    myAckFor(note.id, props.acks, props.myUserId),
  )
}

const draft = ref('')

function add() {
  const body = draft.value.trim()
  if (!body) return
  const id = orchestrator.addComment(props.tripId, null, CLIENT_ACTOR_PLACEHOLDER, body)
  draft.value = ''
  emit('added', id, body)
}
</script>

<template>
  <div class="trip-note-list" data-testid="trip-note-list">
    <p v-if="rows.length === 0" class="empty" data-testid="trip-note-empty">
      {{ t('notes.empty') }}
    </p>

    <div
      v-for="row in rows"
      :key="row.note.id"
      class="note-row"
      :class="{ acked: row.ackedByMe }"
      :data-testid="`trip-note-${row.note.id}`"
      :data-new="row.isNew ? '' : undefined"
    >
      <UserAvatar
        :name="nameOf?.(row.note.author_id) ?? null"
        :seed="row.note.author_id"
        :size="28"
      />
      <div class="body-col">
        <button
          type="button"
          class="body"
          :data-testid="`trip-note-open-${row.note.id}`"
          @click="emit('open', row.note)"
        >
          <span v-if="row.isNew" class="new-badge" data-testid="trip-note-new">{{
            t('notes.new')
          }}</span>
          {{ row.note.body }}
        </button>
        <p v-if="stamp(row.note)" class="stamp">{{ stamp(row.note) }}</p>
      </div>
      <IonCheckbox
        v-if="tickable(row.note)"
        slot="end"
        class="tick"
        :checked="row.ackedByMe"
        :aria-label="t('notes.tick')"
        :data-testid="`trip-note-tick-${row.note.id}`"
        @ionChange="onTick(row.note)"
      />
    </div>

    <div class="composer">
      <IonTextarea
        v-model="draft"
        :placeholder="t('notes.addPlaceholder')"
        auto-grow
        :rows="1"
        data-testid="trip-note-input"
      />
      <IonButton size="small" :disabled="!draft.trim()" data-testid="trip-note-add" @click="add">
        {{ t('common.add') }}
      </IonButton>
    </div>
  </div>
</template>

<style scoped>
.trip-note-list {
  padding: 0 4px 12px;
}

.empty {
  margin: 4px 14px 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.note-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
}

/* Ticked ones sink below and are muted — FR-7.9 §4's own words. */
.note-row.acked {
  opacity: 0.55;
}

.body-col {
  flex: 1;
  min-width: 0;
}

.body {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.new-badge {
  display: inline-block;
  margin-inline-end: 6px;
  padding: 1px 7px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-action);
  color: var(--ct-base);
  font-size: var(--jp-text-xs);
  vertical-align: middle;
}

.stamp {
  margin: 2px 0 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.tick {
  flex: none;
  margin-top: 2px;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 10px 14px 0;
}

.composer ion-textarea {
  --background: var(--ct-surface0);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-md);
}
</style>
