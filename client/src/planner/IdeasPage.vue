<script setup lang="ts">
/**
 * M28 — a trip's ideas (§3.29, FR-29.1–29.6): the planner module's board.
 *
 * Four segments — *Ideen · Shortlist · Gemacht · Verworfen* — each with its
 * count, a chip row narrowing the segment to a tag or to what suits a rainy
 * day, and the ideas as cards. The ＋ writes a new one; tapping a card opens
 * it on the route (`?idea=`), as a sheet on a phone and as the frame's side
 * panel on a desktop (ADR-064), where it is voted on, discussed and moved.
 *
 * Nothing here moves an idea but a person: votes are a signal (FR-29.3).
 * Where nobody else votes or reads — Local and Single-User Mode, a trip
 * nobody shares — the votes, the vote order and the authors are not shown
 * (G-8), and the board is a list of one's own plans.
 */
import {
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
} from '@ionic/vue'
import { addOutline, bulbOutline, swapVerticalOutline, umbrellaOutline } from 'ionicons/icons'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import EmptyState from '@/components/global/EmptyState.vue'
import InlineHint from '@/components/global/InlineHint.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { setHeaderActions } from '@/composables/useHeaderActions'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripScreen } from '@/composables/useTripScreen'
import { t } from '@/i18n'
import { confirmDestructive } from '@/lib/confirm'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { PANEL_HOST_SELECTOR } from '@/lib/frameSlots'
import { presentToast } from '@/lib/toast'
import { IDEA_QUERY_PARAM, tripIdeasPath } from '@/router/paths'
import type {
  Idea,
  IdeaComment,
  IdeaImage,
  IdeaState,
  IdeaTag,
  IdeaVoteValue,
} from '@/types/domain'
import { IDEA_STATE_IDEA, IDEA_STATES } from '@/types/domain'
import { createPlannerActions, type IdeaFields } from './actions'
import {
  IDEA_ORDER_NEWEST,
  IDEA_ORDER_SCORE,
  ideaBoard,
  nextVote,
  voteTally,
  type IdeaOrder,
} from './domain/ideas'
import { ideaPictures } from './domain/pictures'
import IdeaCard from './IdeaCard.vue'
import IdeaDetail from './IdeaDetail.vue'
import IdeaEditSheet from './IdeaEditSheet.vue'
import { usePlannerStore } from './store'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const plannerStore = usePlannerStore()
const actions = createPlannerActions(orchestrator.moduleHost, plannerStore)
const route = useRoute()
const router = useRouter()

// ADR-033: ideas travel the trip partition; „no ideas yet" is only true of a
// partition that has arrived.
const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)
const {
  myUserId,
  nameOf,
  assignees,
  load: loadIdentity,
} = useTripIdentity(props.tripId, orchestrator)

onMounted(async () => {
  await ensure()
  await loadIdentity()
})

/**
 * Whether anybody else votes and reads: an identity to tell people apart and
 * another account on this trip — M26's rule for its share hint (G-8).
 */
const othersShown = computed(() => myUserId.value !== null && assignees.value.length > 1)

// --- the board ---

const segment = ref<IdeaState>(IDEA_STATE_IDEA)
const tag = ref<IdeaTag | null>(null)
const rainOnly = ref(false)
const orderAsked = ref<IdeaOrder>(IDEA_ORDER_SCORE)
/** By votes only where votes are shown; otherwise the newest first. */
const order = computed(() => (othersShown.value ? orderAsked.value : IDEA_ORDER_NEWEST))

const board = computed(() =>
  ideaBoard(
    plannerStore.getIdeas(props.tripId),
    plannerStore.getVotes(props.tripId),
    plannerStore.getComments(props.tripId),
    { state: segment.value, tag: tag.value, rainProof: rainOnly.value },
    order.value,
    myUserId.value,
  ),
)

/** A card's pictures, cover first (FR-29.5). */
function picturesOf(ideaId: string): IdeaImage[] {
  return ideaPictures(ideaId, plannerStore.getImages(props.tripId))
}

const chipsShown = computed(() => board.value.tags.length > 0 || board.value.hasRainProof)
/** A chip left chosen that the segment does not carry is not in force (ideaBoard drops it). */
const tagInForce = computed(() =>
  tag.value !== null && board.value.tags.includes(tag.value) ? tag.value : null,
)
const rainInForce = computed(() => rainOnly.value && board.value.hasRainProof)

function onSegment(event: CustomEvent) {
  const value = (event.detail as { value?: unknown }).value
  if (IDEA_STATES.includes(value as IdeaState)) segment.value = value as IdeaState
}

function chooseTag(next: IdeaTag | null) {
  tag.value = tagInForce.value === next ? null : next
}

setHeaderTitle(
  () => t('ideas.title'),
  () => trip.value?.name,
)

setHeaderActions(() =>
  othersShown.value
    ? [
        {
          id: 'm28-order',
          icon: swapVerticalOutline,
          // Named by what a tap gives, since the menu reads it as a word.
          label: order.value === IDEA_ORDER_SCORE ? t('ideas.orderNewest') : t('ideas.orderScore'),
          overflow: true,
          onClick: () => {
            orderAsked.value =
              order.value === IDEA_ORDER_SCORE ? IDEA_ORDER_NEWEST : IDEA_ORDER_SCORE
          },
        },
      ]
    : [],
)

// --- writing an idea ---

const editing = ref<{ idea: Idea | null } | null>(null)

function onSave(fields: IdeaFields, picture: Promise<Blob | null>) {
  const current = editing.value
  editing.value = null
  if (current?.idea) {
    actions.updateIdea(current.idea, fields)
    void picture.then((blob) => blob && addPictureTo(current.idea!, blob))
    return
  }
  const id = actions.addIdea(props.tripId, fields, myUserId.value)
  if (id === null) return
  const added = plannerStore.getIdea(id)
  if (added) void picture.then((blob) => blob && addPictureTo(added, blob))
  // A new idea is shown where it went and on top, so it does not land below
  // the fold of a list sorted by votes it has none of yet.
  segment.value = IDEA_STATE_IDEA
  tag.value = null
  rainOnly.value = false
  orderAsked.value = IDEA_ORDER_NEWEST
  void presentToast({
    message: t('ideas.added', { title: fields.title.trim() }),
    positionAnchor: FAB_ANCHOR.m28,
  })
}

// --- one idea: the sheet on a phone, the side panel on a desktop (ADR-064) ---

/** M4's breakpoint for the detail as a side panel. */
const DESKTOP_QUERY = '(min-width: 900px)'
const isDesktop = ref(window.matchMedia(DESKTOP_QUERY).matches)
const breakpoint = window.matchMedia(DESKTOP_QUERY)
const onBreakpoint = (event: MediaQueryListEvent) => (isDesktop.value = event.matches)
breakpoint.addEventListener('change', onBreakpoint)
onUnmounted(() => breakpoint.removeEventListener('change', onBreakpoint))

/** Read off the route: a tap, a deep link and a reload open the same idea. */
const openIdeaId = computed(() => {
  const value = route.query[IDEA_QUERY_PARAM]
  return typeof value === 'string' && value !== '' ? value : null
})
const openIdea = computed(() =>
  openIdeaId.value === null ? null : (plannerStore.getIdea(openIdeaId.value) ?? null),
)

/**
 * Pushed, like an excursion line's sheet: a pushed query is the same page, so
 * the browser's back only closes the sheet, and ✕ takes that step back when
 * it can.
 */
function openSheet(idea: Idea) {
  void router.push(tripIdeasPath(props.tripId, idea.id))
}

function closeSheet() {
  const here = tripIdeasPath(props.tripId)
  const previous = (window.history.state as { back?: unknown } | null)?.back
  if (previous === here) router.back()
  else void router.replace(here)
}

async function onState(state: IdeaState) {
  const idea = openIdea.value
  if (!idea) return
  const undo = actions.setState(idea, state)
  await presentToast({
    message: t('ideas.moved', { title: idea.title, state: t(`ideas.state.${state}`) }),
    positionAnchor: FAB_ANCHOR.m28,
    cssClass: 'pack-toast',
    buttons: [{ text: t('packing.undo'), handler: () => undo() }],
  })
}

function onVote(value: IdeaVoteValue) {
  const idea = openIdea.value
  if (!idea) return
  const tally = voteTally(idea.id, plannerStore.getVotes(props.tripId), myUserId.value)
  actions.vote(props.tripId, idea.id, tally, nextVote(tally.mine, value), myUserId.value)
}

function onComment(body: string) {
  const idea = openIdea.value
  if (idea) actions.addComment(props.tripId, idea.id, body, myUserId.value)
}

function onEditComment(comment: IdeaComment, body: string) {
  actions.editComment(comment, body)
}

function onRemoveComment(comment: IdeaComment) {
  actions.removeComment(comment)
}

// --- pictures (FR-29.5) ---

/** Whether a picture is on its way up; the add control waits for it. */
const uploading = ref(false)

async function onAddPicture(file: File) {
  const idea = openIdea.value
  if (idea) await addPictureTo(idea, file)
}

/** A picture from the file picker or from a link's page (FR-29.16), the same way. */
async function addPictureTo(idea: Idea, picture: Blob) {
  if (uploading.value) return
  uploading.value = true
  try {
    await actions.addPicture(idea, picture)
  } catch {
    // Server Mode uploads now or not at all — the bytes do not wait in the
    // outbox (ADR-002) — so a failed upload is said, not queued.
    void presentToast({ message: t('ideas.uploadFailed'), positionAnchor: FAB_ANCHOR.m28 })
  } finally {
    uploading.value = false
  }
}

function onCoverPicture(image: IdeaImage) {
  const idea = openIdea.value
  if (idea) actions.makeCover(idea, image.id)
}

async function onRemovePicture(image: IdeaImage) {
  const confirmed = await confirmDestructive({
    header: t('ideas.removePicture'),
    message: t('ideas.removePictureConfirm'),
    confirmLabel: t('ideas.removePicture'),
    testid: 'idea-picture-remove-confirm',
  })
  if (confirmed) actions.removePicture(image)
}

function onEdit() {
  if (openIdea.value) editing.value = { idea: openIdea.value }
}

async function onRemove() {
  const idea = openIdea.value
  if (!idea) return
  const confirmed = await confirmDestructive({
    header: t('ideas.removeConfirmTitle', { title: idea.title }),
    message: t('ideas.removeConfirmBody'),
    confirmLabel: t('ideas.remove'),
    testid: 'idea-remove-confirm',
  })
  if (!confirmed) return
  closeSheet()
  actions.removeIdea(idea)
}

const EMPTY_KEYS = {
  idea: 'ideas.empty.idea',
  shortlisted: 'ideas.empty.shortlisted',
  done: 'ideas.empty.done',
  dropped: 'ideas.empty.dropped',
} as const satisfies Record<IdeaState, string>
</script>

<template>
  <IonPage>
    <IonContent class="ideas-content" data-testid="m28-page">
      <div class="head">
        <IonSegment :value="segment" data-testid="m28-segments" @ionChange="onSegment">
          <IonSegmentButton
            v-for="state in IDEA_STATES"
            :key="state"
            :value="state"
            :data-testid="`m28-segment-${state}`"
          >
            <IonLabel>
              <span class="segment-label">{{ t(`ideas.state.${state}`) }}</span>
              <span v-if="loaded" class="segment-count jp-num" :data-testid="`m28-count-${state}`">
                {{ board.counts[state] }}</span
              >
            </IonLabel>
          </IonSegmentButton>
        </IonSegment>

        <div v-if="chipsShown" class="chips" data-testid="m28-chips">
          <ChoiceChip
            :pressed="tagInForce === null && !rainInForce"
            data-testid="m28-chip-all"
            @click="((tag = null), (rainOnly = false))"
          >
            {{ t('ideas.all') }}
          </ChoiceChip>
          <ChoiceChip
            v-for="key in board.tags"
            :key="key"
            :pressed="tagInForce === key"
            :data-testid="`m28-chip-tag-${key}`"
            @click="chooseTag(key)"
          >
            {{ t(`ideas.tag.${key}`) }}
          </ChoiceChip>
          <ChoiceChip
            v-if="board.hasRainProof"
            :pressed="rainInForce"
            :label="t('ideas.rainProof')"
            data-testid="m28-chip-rain"
            @click="rainOnly = !rainInForce"
          >
            <IonIcon :icon="umbrellaOutline" aria-hidden="true" />
          </ChoiceChip>
        </div>
      </div>

      <template v-if="loaded">
        <EmptyState
          v-if="board.counts[segment] === 0"
          :icon="segment === IDEA_STATE_IDEA ? bulbOutline : undefined"
          :title="t(EMPTY_KEYS[segment])"
          :hint="segment === IDEA_STATE_IDEA ? t('ideas.emptyHint') : undefined"
          :testid="`m28-empty-${segment}`"
        />
        <InlineHint
          v-else-if="board.cards.length === 0"
          class="hint-wide"
          data-testid="m28-empty-filtered"
        >
          {{ t('ideas.emptyFiltered') }}
        </InlineHint>
        <div v-else class="list jp-card" data-testid="m28-list">
          <IdeaCard
            v-for="card in board.cards"
            :key="card.idea.id"
            :card="card"
            :pictures="picturesOf(card.idea.id)"
            :votes-shown="othersShown"
            :name-of="nameOf"
            @open="openSheet(card.idea)"
          />
        </div>
      </template>

      <IonFab :id="FAB_ANCHOR.m28" slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton
          :aria-label="t('ideas.newTitle')"
          data-testid="m28-fab"
          @click="editing = { idea: null }"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <IdeaEditSheet
        :open="editing !== null"
        :idea="editing?.idea ?? null"
        :preview="
          orchestrator.moduleHost.linkPreview.offered()
            ? {
                read: (url: string) => orchestrator.moduleHost.linkPreview.read(tripId, url),
                picture: (imageUrl: string) =>
                  orchestrator.moduleHost.linkPreview.picture(tripId, imageUrl),
              }
            : null
        "
        :accepts-picture="!editing?.idea || picturesOf(editing.idea.id).length === 0"
        @close="editing = null"
        @save="onSave"
      />

      <SheetModal
        v-if="!isDesktop"
        :is-open="openIdea !== null && editing === null"
        testid="m28-idea-modal"
        @dismiss="closeSheet"
      >
        <IdeaDetail
          v-if="openIdea"
          :idea-id="openIdea.id"
          :others-shown="othersShown"
          :my-user-id="myUserId"
          :name-of="nameOf"
          :uploading="uploading"
          @close="closeSheet"
          @edit="onEdit"
          @remove="onRemove"
          @state="onState"
          @vote="onVote"
          @comment="onComment"
          @edit-comment="onEditComment"
          @remove-comment="onRemoveComment"
          @add-picture="onAddPicture"
          @cover-picture="onCoverPicture"
          @remove-picture="onRemovePicture"
        />
      </SheetModal>
      <Teleport v-if="isDesktop && openIdea" defer :to="PANEL_HOST_SELECTOR">
        <aside class="idea-panel" data-testid="m28-idea-panel">
          <IdeaDetail
            :idea-id="openIdea.id"
            :others-shown="othersShown"
            :my-user-id="myUserId"
            :name-of="nameOf"
            :uploading="uploading"
            @close="closeSheet"
            @edit="onEdit"
            @remove="onRemove"
            @state="onState"
            @vote="onVote"
            @comment="onComment"
            @edit-comment="onEditComment"
            @remove-comment="onRemoveComment"
            @add-picture="onAddPicture"
            @cover-picture="onCoverPicture"
            @remove-picture="onRemovePicture"
          />
        </aside>
      </Teleport>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.ideas-content {
  --padding-top: 6px;
  /* Room for the FAB over the last card. */
  --padding-bottom: 88px;
}

.head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 12px 12px;
}

ion-segment-button {
  --padding-start: 4px;
  --padding-end: 4px;
  min-width: 0;
}

.segment-label,
.segment-count {
  font-size: var(--jp-text-xs);
}

.segment-count {
  margin-inline-start: 4px;
  color: var(--ct-subtext0);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chips ion-icon {
  vertical-align: -2px;
  font-size: var(--jp-icon-xs);
}

.list {
  margin: 0 12px;
}

.hint-wide {
  margin: 4px 18px 12px;
}

/* M5's side panel (G-9), as M4 lays it out in the frame's second pane. */
.idea-panel {
  width: var(--jp-panel-w);
  overflow-y: auto;
  background: var(--ct-mantle);
  border-left: 1px solid var(--ct-surface1);
  box-shadow: var(--jp-shadow-panel);
}
</style>
