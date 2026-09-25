<script setup lang="ts">
/**
 * M26 — a trip's notes (FR-7.13), the fourth view a trip is worked in.
 *
 * A note used to be a line in M25's second segment (FR-7.9 decision 1). As a
 * thread it is a place people write in, which is the form ADR-051's revisit
 * trigger names, and a note *is not work*: so it has a view of its own, the
 * fourth pill (ADR-051 amendment 3 made the room).
 *
 * The list is the threads, the one with the latest activity first, each a
 * card that shows its words — the notes are looked things up in — and opens
 * its own thread view. Writing a new one is the FAB and a sheet, so it is
 * one tap away however long the list has grown.
 */
import {
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonInput,
  IonPage,
  IonTextarea,
} from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import InlineHint from '@/components/global/InlineHint.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import TripNoteCard from '@/components/trips/TripNoteCard.vue'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripScreen } from '@/composables/useTripScreen'
import { noteThreads } from '@/domain/tripNotes'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { tripNotesPath } from '@/router/paths'
import { useTripStore } from '@/stores/tripStore'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const tripStore = useTripStore()
const router = useRouter()

// ADR-033: notes travel the trip partition; „no notes" is only true of a
// partition that has arrived.
const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)
const { myUserId, nameOf, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)

/**
 * Whether anybody else reads what is written here: an identity to tell
 * writers apart and another member of this trip. Not in Local Mode, not in
 * Single-User Mode, not on a trip nobody shares (G-8).
 */
const othersRead = computed(
  () => myUserId.value !== null && tripStore.getMembers(props.tripId).length > 1,
)

const threads = computed(() =>
  noteThreads(
    tripStore.getTripComments(props.tripId),
    tripStore.getNoteAcks(props.tripId),
    myUserId.value,
  ),
)

function openThread(id: string) {
  void router.push(tripNotesPath(props.tripId, id))
}

// --- a new note ---

const composing = ref(false)
const draft = ref('')
const draftTitle = ref('')

function closeComposer() {
  composing.value = false
  draft.value = ''
  draftTitle.value = ''
}

function add() {
  const body = draft.value.trim()
  if (!body) return
  const title = draftTitle.value.trim() || null
  orchestrator.addComment(props.tripId, null, CLIENT_ACTOR_PLACEHOLDER, body, { title })
  closeComposer()
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
    <IonContent class="notes-content" data-testid="m26-page">
      <template v-if="loaded">
        <InlineHint v-if="threads.length === 0" class="hint-wide" data-testid="m26-empty">
          {{ t('notes.empty') }}
        </InlineHint>

        <section class="threads" data-testid="m26-threads">
          <TripNoteCard
            v-for="thread in threads"
            :key="thread.root.id"
            :thread="thread"
            :name-of="nameOf"
            @open="openThread(thread.root.id)"
          />
        </section>
      </template>

      <IonFab :id="FAB_ANCHOR.m26" slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton
          :aria-label="t('notes.newNote')"
          data-testid="m26-fab"
          @click="composing = true"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <SheetModal :is-open="composing" testid="m26-composer" @dismiss="closeComposer">
        <div class="sheet">
          <SheetHead
            :title="t('notes.newNote')"
            title-testid="m26-composer-title"
            close-testid="m26-composer-close"
            @close="closeComposer"
          />
          <IonInput
            v-model="draftTitle"
            class="title-field"
            :placeholder="t('notes.titlePlaceholder')"
            :aria-label="t('notes.titlePlaceholder')"
            data-testid="m26-title-input"
          />
          <IonTextarea
            v-model="draft"
            :placeholder="t('notes.addPlaceholder')"
            :aria-label="t('notes.addPlaceholder')"
            auto-grow
            :rows="3"
            data-testid="m26-input"
          />
          <!-- Who reads it, said before it is sent — and only where somebody
               else does. -->
          <p v-if="othersRead" class="share-hint">{{ t('notes.shareHint') }}</p>
          <div class="actions">
            <IonButton fill="clear" data-testid="m26-cancel" @click="closeComposer">
              {{ t('common.cancel') }}
            </IonButton>
            <IonButton shape="round" :disabled="!draft.trim()" data-testid="m26-add" @click="add">
              {{ t('notes.share') }}
            </IonButton>
          </div>
        </div>
      </SheetModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.notes-content {
  --padding-top: 10px;
  /* Room for the FAB over the last card. */
  --padding-bottom: 88px;
}

.hint-wide {
  margin: 4px 18px 12px;
}

.sheet {
  padding: 4px 16px 18px;
}

.sheet ion-input,
.sheet ion-textarea {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  margin-top: 10px;
  border-radius: var(--jp-r-md);
}

.title-field {
  font-weight: var(--jp-weight-semibold);
}

.share-hint {
  margin: 8px 2px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.actions {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
}
</style>
