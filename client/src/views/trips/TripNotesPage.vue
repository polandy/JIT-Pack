<script setup lang="ts">
/**
 * M26 — a trip's notes (FR-7.13), the fourth view a trip is worked in.
 *
 * A note used to be a line in M25's second segment (FR-7.9 decision 1). As a
 * thread it is a place people write in, which is the form ADR-051's revisit
 * trigger names, and a note *is not work*: so it has a view of its own, the
 * fourth pill (ADR-051 amendment 3 made the room).
 *
 * The list is the threads, the one with the latest activity first; each
 * expands in place, several at once. The composer sits at the bottom, a
 * title behind *+ Titel* so writing a quick number stays one field. A link
 * naming a thread (M1's row, a notification) opens it expanded.
 */
import { IonButton, IonContent, IonInput, IonPage, IonTextarea } from '@ionic/vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import InlineHint from '@/components/global/InlineHint.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import TripNoteSheet from '@/components/trips/TripNoteSheet.vue'
import TripNoteThread from '@/components/trips/TripNoteThread.vue'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripScreen } from '@/composables/useTripScreen'
import { noteAckState, noteThreads } from '@/domain/tripNotes'
import { t } from '@/i18n'
import { THREAD_QUERY_PARAM } from '@/router/paths'
import { useTripStore } from '@/stores/tripStore'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { ItemComment } from '@/types/domain'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const tripStore = useTripStore()
const route = useRoute()

// ADR-033: notes travel the trip partition; „no notes" is only true of a
// partition that has arrived.
const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)
const { myUserId, nameOf, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)

/** Every trip-level comment that is not a task — first notes and replies alike. */
const notes = computed(() => tripStore.getTripComments(props.tripId))
const acks = computed(() => tripStore.getNoteAcks(props.tripId))
const threads = computed(() => noteThreads(notes.value, acks.value, myUserId.value))

// --- which threads are open ---

const expanded = ref(new Set<string>())

function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

/** A link naming a thread opens it and brings it into view. */
const linked = computed(() => {
  const value = route.query[THREAD_QUERY_PARAM]
  return typeof value === 'string' ? value : null
})
const contentEl = ref<{ $el: HTMLElement } | null>(null)

watch(
  [linked, loaded],
  async ([id, ready]) => {
    if (!id || !ready) return
    expanded.value = new Set([...expanded.value, id])
    await nextTick()
    contentEl.value?.$el
      .querySelector(`[data-testid="note-thread-${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: 'start' })
  },
  { immediate: true },
)

// --- the composer ---

const draft = ref('')
const draftTitle = ref('')
const titleOpen = ref(false)

function add() {
  const body = draft.value.trim()
  if (!body) return
  const title = draftTitle.value.trim() || null
  orchestrator.addComment(props.tripId, null, CLIENT_ACTOR_PLACEHOLDER, body, { title })
  draft.value = ''
  draftTitle.value = ''
  titleOpen.value = false
}

// --- an entry's sheet ---

const openedId = ref<string | null>(null)
const opened = computed(() => notes.value.find((note) => note.id === openedId.value) ?? null)
const openedAckedBy = computed(() =>
  opened.value && !opened.value.parent_id
    ? noteAckState(opened.value.id, acks.value, myUserId.value).ackedBy
    : new Set<string>(),
)
const openedReplyCount = computed(() =>
  opened.value ? notes.value.filter((note) => note.parent_id === opened.value?.id).length : 0,
)

function openEntry(entry: ItemComment) {
  openedId.value = entry.id
}

function onSheetRemove() {
  const entry = opened.value
  openedId.value = null
  if (entry) orchestrator.deleteComment(props.tripId, entry.id)
}

onMounted(async () => {
  await ensure()
  await loadIdentity()
})

setHeaderTitle(
  () => t('notes.title'),
  () => trip.value?.name,
)
</script>

<template>
  <IonPage>
    <IonContent ref="contentEl" class="notes-content" data-testid="m26-page">
      <template v-if="loaded">
        <InlineHint v-if="threads.length === 0" class="hint-wide" data-testid="m26-empty">
          {{ t('notes.empty') }}
        </InlineHint>

        <section class="threads" data-testid="m26-threads">
          <TripNoteThread
            v-for="thread in threads"
            :key="thread.root.id"
            :trip-id="tripId"
            :thread="thread"
            :expanded="expanded.has(thread.root.id)"
            :acks="acks"
            :my-user-id="myUserId"
            :name-of="nameOf"
            @toggle="toggle(thread.root.id)"
            @open="openEntry"
          />
        </section>

        <div class="composer jp-card" data-testid="m26-composer">
          <IonInput
            v-if="titleOpen"
            v-model="draftTitle"
            :placeholder="t('notes.titlePlaceholder')"
            :aria-label="t('notes.titlePlaceholder')"
            data-testid="m26-title-input"
          />
          <button
            v-else
            type="button"
            class="add-title"
            data-testid="m26-add-title"
            @click="titleOpen = true"
          >
            {{ t('notes.addTitle') }}
          </button>
          <div class="row">
            <IonTextarea
              v-model="draft"
              :placeholder="t('notes.addPlaceholder')"
              :aria-label="t('notes.addPlaceholder')"
              auto-grow
              :rows="1"
              data-testid="m26-input"
            />
            <IonButton size="small" :disabled="!draft.trim()" data-testid="m26-add" @click="add">
              {{ t('notes.send') }}
            </IonButton>
          </div>
        </div>
      </template>

      <SheetModal :is-open="opened !== null" testid="m26-note-modal" @dismiss="openedId = null">
        <TripNoteSheet
          v-if="opened"
          :note="opened"
          :acked-by="openedAckedBy"
          :reply-count="openedReplyCount"
          :name-of="nameOf"
          @close="openedId = null"
          @remove="onSheetRemove"
        />
      </SheetModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.notes-content {
  --padding-top: 10px;
  --padding-bottom: 24px;
}

.hint-wide {
  margin: 4px 18px 12px;
}

.composer {
  margin: 6px 12px 0;
  padding: 8px 12px 10px;
}

.add-title {
  padding: 2px 0 6px;
  border: none;
  background: none;
  color: var(--jp-action);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.composer ion-input {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  margin-bottom: 6px;
  border-radius: var(--jp-r-md);
}

.row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.row ion-textarea {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-md);
}
</style>
