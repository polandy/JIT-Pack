<script setup lang="ts">
/**
 * One trip-note thread (FR-7.13) — a first note with its replies, one level
 * deep.
 *
 * Collapsed, it is one card: the title (or the first line), who wrote it or
 * how many answered and when, the avatars of those who took part, the *neu*
 * count, and the tick. Expanded in place: the first note in full, the reply
 * field right under it, then the replies newest first — so what I just wrote
 * lands where I wrote it.
 *
 * A thread new for me is not opened by itself: the badge says so, and a list
 * that opens itself moves under the thumb. Expanding is not seeing either —
 * *seen* is a statement (FR-7.9), made with the tick.
 */
import { IonButton, IonCheckbox, IonIcon, IonInput } from '@ionic/vue'
import { chevronDownOutline, chevronForwardOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import TripNoteEntry from '@/components/trips/TripNoteEntry.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { myAckFor, threadName, type NoteThread } from '@/domain/tripNotes'
import { t } from '@/i18n'
import { noteThreadMeta } from '@/lib/noteFacts'
import type { NameOf } from '@/lib/rowFacts'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { ItemComment, NoteAck } from '@/types/domain'

const props = defineProps<{
  tripId: string
  thread: NoteThread
  expanded: boolean
  /** Every tick of the trip's notes — this reader's row is found in it. */
  acks: readonly NoteAck[]
  /** Null in Single-User/Local Mode (G-8): nothing is mine to tell apart. */
  myUserId: string | null
  nameOf: NameOf
}>()

const emit = defineEmits<{
  toggle: []
  /** An entry's words were tapped — the screen opens its sheet. */
  open: [entry: ItemComment]
}>()

const orchestrator = useOrchestrator()

const root = computed(() => props.thread.root)
const name = computed(() => threadName(root.value))
const meta = computed(() => noteThreadMeta(props.thread, props.nameOf))
const unseenIds = computed(() => new Set(props.thread.unseen.map((e) => e.id)))
const newCount = computed(() => props.thread.unseen.length)

/**
 * What I may edit (question 2). Without an identity (Local Mode, G-8) there
 * is one writer on the device, and every entry is theirs — the scratchpad
 * keeps its edit.
 */
function isMine(entry: ItemComment): boolean {
  return props.myUserId === null || entry.author_id === props.myUserId
}

function onTick() {
  orchestrator.toggleNoteTick(
    props.tripId,
    root.value.id,
    CLIENT_ACTOR_PLACEHOLDER,
    myAckFor(root.value.id, props.acks, props.myUserId),
    { ticked: props.thread.ticked, seenThrough: props.thread.seenThrough },
  )
}

const reply = ref('')

function sendReply() {
  const body = reply.value.trim()
  if (!body) return
  orchestrator.addComment(props.tripId, null, CLIENT_ACTOR_PLACEHOLDER, body, {
    parentId: root.value.id,
  })
  reply.value = ''
}

function onSave(entry: ItemComment, body: string, title: string | null | undefined) {
  orchestrator.editNote(props.tripId, entry, body, title)
}
</script>

<template>
  <article
    class="thread jp-card"
    :class="{ open: expanded }"
    :data-testid="`note-thread-${root.id}`"
    :data-new="newCount > 0 ? '' : undefined"
  >
    <div class="head">
      <button
        type="button"
        class="hit"
        :aria-expanded="expanded ? 'true' : 'false'"
        :data-testid="`note-thread-toggle-${root.id}`"
        @click="emit('toggle')"
      >
        <UserAvatar :name="nameOf(root.author_id) ?? null" :seed="root.author_id" :size="30" />
        <span class="hb">
          <span class="ttl" :class="{ untitled: !root.title }">
            <span v-if="newCount > 0" class="new-badge" data-testid="note-thread-new">{{
              newCount > 1 ? t('notes.newCount', { n: newCount }) : t('notes.new')
            }}</span>
            <span data-testid="note-thread-name">{{ name }}</span>
          </span>
          <span class="tmeta">
            <span data-testid="note-thread-meta">{{ meta }}</span>
            <span v-if="thread.participants.length > 1" class="avs" aria-hidden="true">
              <UserAvatar
                v-for="person in thread.participants"
                :key="person"
                :name="nameOf(person) ?? null"
                :seed="person"
                :size="18"
              />
            </span>
          </span>
        </span>
        <IonIcon
          class="chev"
          :icon="expanded ? chevronDownOutline : chevronForwardOutline"
          aria-hidden="true"
        />
      </button>
      <IonCheckbox
        v-if="thread.tickable"
        class="tick"
        :checked="thread.ticked"
        :aria-label="t('notes.tick')"
        :data-testid="`note-thread-tick-${root.id}`"
        @ionChange="onTick"
      />
    </div>

    <div v-if="expanded" class="tbody" :data-testid="`note-thread-body-${root.id}`">
      <TripNoteEntry
        :entry="root"
        first
        :unseen="unseenIds.has(root.id)"
        :mine="isMine(root)"
        :name-of="nameOf"
        @open="emit('open', root)"
        @save="(body, title) => onSave(root, body, title)"
      />
      <div class="reply">
        <IonInput
          v-model="reply"
          :placeholder="t('notes.replyPlaceholder')"
          :aria-label="t('notes.replyLabel')"
          :data-testid="`note-thread-reply-input-${root.id}`"
          @keydown.enter.prevent="sendReply"
        />
        <IonButton
          size="small"
          :disabled="!reply.trim()"
          :data-testid="`note-thread-reply-send-${root.id}`"
          @click="sendReply"
        >
          {{ t('notes.send') }}
        </IonButton>
      </div>
      <p v-if="thread.replies.length > 0" class="replies-h jp-section-count">
        {{ t('notes.repliesHead', { n: thread.replies.length }) }}
      </p>
      <TripNoteEntry
        v-for="entry in thread.replies"
        :key="entry.id"
        :entry="entry"
        :first="false"
        :unseen="unseenIds.has(entry.id)"
        :mine="isMine(entry)"
        :name-of="nameOf"
        @open="emit('open', entry)"
        @save="(body) => onSave(entry, body, undefined)"
      />
    </div>
  </article>
</template>

<style scoped>
.thread {
  margin: 0 12px 10px;
  padding: 4px 12px;
}

.head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hit {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.hb {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ttl {
  overflow: hidden;
  color: var(--ct-text);
  font-weight: var(--jp-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The first line standing in for a title reads as words, not as a heading. */
.ttl.untitled {
  font-weight: var(--jp-weight-regular);
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

.tmeta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.avs {
  display: inline-flex;
}

.avs > * + * {
  margin-inline-start: -5px;
}

.chev {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-sm);
}

.tick {
  flex: none;
}

.tbody {
  padding: 2px 0 8px;
  border-top: 1px solid var(--ct-surface1);
}

.reply {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 8px 36px;
}

.reply ion-input {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-md);
}

.replies-h {
  margin: 6px 0 0 36px;
}
</style>
