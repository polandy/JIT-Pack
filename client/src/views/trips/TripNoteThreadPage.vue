<script setup lang="ts">
/**
 * M26's thread view (FR-7.13) — one conversation, read as one.
 *
 * The first note stands on top as a card: it is the reference the thread is
 * about, and says who has seen it (FR-7.9 decision 3, on the thread rather
 * than on the list). The replies follow in the order they were written, and
 * the reply field is fixed at the bottom, where the thumb is and where the
 * reply lands — the UX rework reversed question 1's newest-first, which had
 * put the field between the note and its answers.
 *
 * *Neu seit deinem letzten Besuch* is a divider above the first unseen
 * reply, and *Gelesen* a labelled button under the last: seeing stays a
 * statement (FR-7.9), made here rather than with a checkbox on the list.
 * Tapping an entry opens its menu.
 */
import {
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonInput,
  IonPage,
  actionSheetController,
} from '@ionic/vue'
import { checkmarkOutline, copyOutline, createOutline, send, trashOutline } from 'ionicons/icons'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import TripNoteEntry from '@/components/trips/TripNoteEntry.vue'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripScreen } from '@/composables/useTripScreen'
import {
  firstUnseenReply,
  myAckFor,
  noteAckState,
  noteMenuEntries,
  noteThreads,
  threadName,
  type NoteMenuAction,
} from '@/domain/tripNotes'
import { t } from '@/i18n'
import { copyText } from '@/lib/clipboard'
import { presentToast } from '@/lib/toast'
import { tripNotesPath } from '@/router/paths'
import { useTripStore } from '@/stores/tripStore'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { ItemComment } from '@/types/domain'

const props = defineProps<{ tripId: string; threadId: string }>()

const orchestrator = useOrchestrator()
const tripStore = useTripStore()
const router = useRouter()

const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)
const { myUserId, nameOf, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)

const acks = computed(() => tripStore.getNoteAcks(props.tripId))
const thread = computed(
  () =>
    noteThreads(tripStore.getTripComments(props.tripId), acks.value, myUserId.value).find(
      (candidate) => candidate.root.id === props.threadId,
    ) ?? null,
)
const unseenIds = computed(() => new Set(thread.value?.unseen.map((entry) => entry.id)))
const divider = computed(() => (thread.value ? firstUnseenReply(thread.value) : null))
const seenBy = computed(() => {
  if (!thread.value) return []
  const { ackedBy } = noteAckState(thread.value.root.id, acks.value, myUserId.value)
  return [...ackedBy].map((id) => nameOf(id) ?? id).sort((a, b) => a.localeCompare(b))
})

/**
 * What I may edit (question 2). Without an identity (Local Mode, G-8) there
 * is one writer on the device, and every entry is theirs.
 */
function isMine(entry: ItemComment): boolean {
  return myUserId.value === null || entry.author_id === myUserId.value
}

// A thread deleted — here or on another device — has nothing left to show.
watch([loaded, thread], ([ready, current]) => {
  if (ready && !current) void router.replace(tripNotesPath(props.tripId))
})

// --- reading ---

const contentEl = ref<InstanceType<typeof IonContent> | null>(null)

/**
 * Arriving with something new, the view opens where the new begins — once:
 * the divider is only known when the identity has answered, and a divider
 * that moves on later (a tick, a reply) must not pull the page along.
 */
let arrived = false
watch([loaded, divider], async ([ready, first]) => {
  if (arrived || !ready || !first) return
  arrived = true
  await nextTick()
  contentEl.value?.$el
    .querySelector('[data-testid="note-thread-divider"]')
    ?.scrollIntoView({ block: 'center' })
})

function markRead() {
  const current = thread.value
  if (!current) return
  orchestrator.toggleNoteTick(
    props.tripId,
    current.root.id,
    CLIENT_ACTOR_PLACEHOLDER,
    myAckFor(current.root.id, acks.value, myUserId.value),
    { ticked: false, seenThrough: current.seenThrough },
  )
}

// --- replying ---

const reply = ref('')

async function sendReply() {
  const body = reply.value.trim()
  if (!body) return
  const id = orchestrator.addComment(props.tripId, null, CLIENT_ACTOR_PLACEHOLDER, body, {
    parentId: props.threadId,
  })
  reply.value = ''
  // What I wrote lands where I wrote it: at the bottom, brought into view.
  await nextTick()
  contentEl.value?.$el
    .querySelector(`[data-testid="note-entry-${CSS.escape(id)}"]`)
    ?.scrollIntoView({ block: 'end', behavior: 'smooth' })
}

function onSave(entry: ItemComment, body: string, title: string | null | undefined) {
  orchestrator.editNote(props.tripId, entry, body, title)
}

// --- an entry's menu ---

const entryRefs = new Map<string, InstanceType<typeof TripNoteEntry>>()

function setEntryRef(id: string, el: unknown) {
  if (el) entryRefs.set(id, el as InstanceType<typeof TripNoteEntry>)
  else entryRefs.delete(id)
}

function removeLabel(entry: ItemComment): string {
  if (entry.parent_id) return t('notes.removeReply')
  const n = thread.value?.replies.length ?? 0
  return n > 0 ? t('notes.removeWithReplies', { n }) : t('notes.remove')
}

const MENU_BUTTONS: Record<
  NoteMenuAction,
  { label: (entry: ItemComment) => string; icon: string; testid: string; role?: 'destructive' }
> = {
  copy: { label: () => t('notes.copy'), icon: copyOutline, testid: 'note-menu-copy' },
  edit: { label: () => t('common.edit'), icon: createOutline, testid: 'note-menu-edit' },
  remove: {
    label: removeLabel,
    icon: trashOutline,
    testid: 'note-menu-remove',
    role: 'destructive',
  },
}

async function runMenu(action: NoteMenuAction, entry: ItemComment) {
  if (action === 'copy') {
    if (await copyText(entry.body)) await presentToast({ message: t('notes.copied') })
  } else if (action === 'edit') {
    entryRefs.get(entry.id)?.startEdit()
  } else {
    orchestrator.deleteComment(props.tripId, entry.id)
  }
}

async function openMenu(entry: ItemComment) {
  const sheet = await actionSheetController.create({
    htmlAttributes: { 'data-testid': 'note-menu' },
    buttons: [
      ...noteMenuEntries(isMine(entry)).map((action) => ({
        text: MENU_BUTTONS[action].label(entry),
        icon: MENU_BUTTONS[action].icon,
        role: MENU_BUTTONS[action].role,
        htmlAttributes: { 'data-testid': MENU_BUTTONS[action].testid },
        handler: () => {
          void runMenu(action, entry)
        },
      })),
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
}

onMounted(async () => {
  await ensure()
  await loadIdentity()
})

setHeaderTitle(
  () => (thread.value ? threadName(thread.value.root) : t('notes.title')),
  () => trip.value?.name,
)
</script>

<template>
  <IonPage>
    <IonContent ref="contentEl" class="thread-content" data-testid="m26-thread">
      <template v-if="loaded && thread">
        <TripNoteEntry
          :ref="(el) => setEntryRef(threadId, el)"
          :entry="thread.root"
          first
          :unseen="unseenIds.has(thread.root.id)"
          :mine="isMine(thread.root)"
          :seen-by="seenBy"
          :name-of="nameOf"
          @menu="openMenu(thread.root)"
          @save="(body, title) => onSave(thread!.root, body, title)"
        />
        <div class="replies" data-testid="note-thread-replies">
          <template v-for="entry in thread.replies" :key="entry.id">
            <p
              v-if="divider?.id === entry.id"
              class="divider"
              data-testid="note-thread-divider"
              role="separator"
            >
              <span>{{ t('notes.newDivider') }}</span>
            </p>
            <TripNoteEntry
              :ref="(el) => setEntryRef(entry.id, el)"
              :entry="entry"
              :first="false"
              :unseen="unseenIds.has(entry.id)"
              :mine="isMine(entry)"
              :name-of="nameOf"
              @menu="openMenu(entry)"
              @save="(body) => onSave(entry, body, undefined)"
            />
          </template>
        </div>
        <div v-if="thread.unseen.length > 0" class="read">
          <IonButton
            fill="outline"
            size="small"
            shape="round"
            data-testid="note-thread-read"
            @click="markRead"
          >
            <IonIcon slot="start" :icon="checkmarkOutline" aria-hidden="true" />
            {{ t('notes.markRead') }}
          </IonButton>
        </div>
      </template>
    </IonContent>
    <IonFooter class="composer" data-testid="note-thread-composer">
      <IonInput
        v-model="reply"
        :placeholder="t('notes.replyPlaceholder')"
        :aria-label="t('notes.replyLabel')"
        data-testid="note-thread-reply-input"
        @keydown.enter.prevent="sendReply"
      />
      <IonButton
        shape="round"
        :disabled="!reply.trim()"
        :aria-label="t('notes.send')"
        data-testid="note-thread-reply-send"
        @click="sendReply"
      >
        <IonIcon slot="icon-only" :icon="send" aria-hidden="true" />
      </IonButton>
    </IonFooter>
  </IonPage>
</template>

<style scoped>
.thread-content {
  --padding-bottom: 16px;
}

.replies {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 12px;
  color: var(--jp-action);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.divider::before,
.divider::after {
  flex: 1;
  height: 1px;
  background: color-mix(in srgb, var(--jp-action) 50%, transparent);
  content: '';
}

.read {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.read ion-button {
  --border-color: var(--jp-done);
  --color: var(--jp-done);
}

.composer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--jp-surface-border);
  background: var(--jp-surface-page);
}

.composer ion-input {
  --background: var(--jp-surface-sunken);
  --padding-start: 14px;
  --padding-end: 14px;
  flex: 1;
  border-radius: var(--jp-r-pill);
}
</style>
