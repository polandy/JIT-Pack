<script setup lang="ts">
/**
 * One idea, opened (FR-29.2–29.5, FR-29.17): who wrote it and when, its
 * pictures as a mosaic, its GPX tracks on a map, the link as a card, the note, the votes with the voters'
 * names, and the discussion with its field at the foot. The same body is the
 * phone's sheet and the desktop's side panel (ADR-064), so what it does is
 * handed to the screen as events rather than written here.
 *
 * Votes and the author's name appear only where somebody else reads them
 * (FR-29.3's G-8); the discussion stays, as a place to note things down.
 *
 * The state is set by hand (FR-29.2) from the first block under the head:
 * the step ahead — onto the shortlist, then onto a day (FR-29.14, through
 * M29's sheet while the trip has its dates) — and *Gemacht*; a done or
 * dropped idea says so there, with its one way back. The seldom moves, the
 * edit and the delete sit behind the head's ⋮.
 *
 * *Daraus gemacht* (FR-29.13) names what came of the idea — read through the
 * kernel's sources, since the results are the packing side's and the
 * shopping module's rows — and, on the shortlist, offers what it can still
 * become: each a link to the screen that makes it, its creator pre-filled.
 */
import {
  IonButton,
  IonIcon,
  IonInput,
  IonSpinner,
  IonTextarea,
  actionSheetController,
} from '@ionic/vue'
import {
  calendarOutline,
  cameraOutline,
  cartOutline,
  checkboxOutline,
  checkmarkOutline,
  createOutline,
  ellipsisVertical,
  gitBranchOutline,
  arrowUndoOutline,
  linkOutline,
  mapOutline,
  openOutline,
  removeCircleOutline,
  send,
  starOutline,
  thumbsDownOutline,
  thumbsUpOutline,
  trailSignOutline,
  trashOutline,
  umbrellaOutline,
} from 'ionicons/icons'
import { computed, inject, ref, watch } from 'vue'

import SectionHead from '@/components/global/SectionHead.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import TrackCard from '@/components/global/TrackCard.vue'
import { MAX_TRACKS, orderTracks } from '@/domain/track'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { t } from '@/i18n'
import { useTileState } from '@/composables/shared/mapTiles'
import {
  IDEA_RESULT_EXCURSION,
  IDEA_RESULT_SHOPPING,
  IDEA_RESULT_TASK,
  type IdeaResultKind,
} from '@/domain/ideaBridge'
import { IDEA_RESULT_SCREEN, IDEA_RESULT_SOURCES } from '@/kernel/ideaBridge'
import { writtenMeta } from '@/lib/noteFacts'
import type { NameOf } from '@/lib/rowFacts'
import { shortDueDay } from '@/lib/taskDueText'
import type {
  IdeaComment,
  IdeaImage,
  IdeaState,
  IdeaTrack,
  IdeaVoteValue,
  TrackFields,
} from '@/types/domain'
import {
  IDEA_STATE_DONE,
  IDEA_STATE_DROPPED,
  IDEA_STATE_IDEA,
  IDEA_STATE_SHORTLISTED,
  IDEA_VOTE_DOWN,
  IDEA_VOTE_UP,
} from '@/types/domain'
import { ideaBridgePath } from '@/router/paths'
import { offeredResults } from './domain/bridge'
import { isPlanTime } from './domain/dayPlan'
import {
  IDEA_STEP_PLAN,
  IDEA_STEP_SHORTLIST,
  ideaDiscussion,
  ideaLeadStep,
  linkSite,
  menuMoves,
  reopenedState,
  voteTally,
} from './domain/ideas'
import { MAX_IDEA_IMAGES, canAddPicture, ideaPictures } from './domain/pictures'
import IdeaMosaic from './IdeaMosaic.vue'
import IdeaPictureViewer from './IdeaPictureViewer.vue'
import { usePlannerStore } from './store'

const props = defineProps<{
  ideaId: string
  /** Whether votes and authors are shown (FR-29.3's G-8). */
  othersShown: boolean
  myUserId: string | null
  nameOf: NameOf
  /** Whether a picture is on its way up, so the add control waits for it. */
  uploading: boolean
  /** The trip's days, for planning the idea on one (FR-29.14); empty without both dates. */
  days: readonly string[]
  /** Whether a GPX file is being read and sent, so its add control waits for it. */
  trackBusy: boolean
}>()

const emit = defineEmits<{
  close: []
  edit: []
  remove: []
  state: [state: IdeaState]
  vote: [value: IdeaVoteValue]
  comment: [body: string]
  editComment: [comment: IdeaComment, body: string]
  removeComment: [comment: IdeaComment]
  addPicture: [file: File]
  coverPicture: [image: IdeaImage]
  removePicture: [image: IdeaImage]
  addTrack: [file: File]
  updateTrack: [
    track: IdeaTrack,
    settings: Partial<Pick<TrackFields, 'name' | 'kind' | 'with_kid' | 'pause_min'>>,
  ]
  downloadTrack: [track: IdeaTrack]
  replaceTrack: [track: IdeaTrack, file: File]
  removeTrack: [track: IdeaTrack]
  /** FR-29.20: a track's route edited, or one drawn from nothing (null). */
  editTrack: [track: IdeaTrack | null]
  /** FR-29.13: leave for another screen — a result, or the one that makes one. */
  go: [path: string]
}>()

const tiles = useTileState()

const plannerStore = usePlannerStore()

const idea = computed(() => plannerStore.getIdea(props.ideaId) ?? null)
const tally = computed(() =>
  idea.value
    ? voteTally(idea.value.id, plannerStore.getVotes(idea.value.trip_id), props.myUserId)
    : null,
)
const pictures = computed(() =>
  idea.value ? ideaPictures(idea.value.id, plannerStore.getImages(idea.value.trip_id)) : [],
)

// --- the first block and the ⋮ (FR-29.2) ---

const lead = computed(() => (idea.value ? ideaLeadStep(idea.value.state) : null))

/** FR-29.14: a day is given on the shortlist, and only while the trip has its days. */
const plannable = computed(() => lead.value === IDEA_STEP_PLAN && props.days.length > 0)

/** „Fr., 2.10. · 09:00" once it has a day — the planner's button names it. */
const plannedText = computed(() => {
  const day = idea.value?.planned_on
  if (!day) return null
  const at = idea.value?.planned_at
  return isPlanTime(at) ? `${shortDueDay(day)} · ${at}` : shortDueDay(day)
})

/** FR-29.14: M29's sheet, the idea chosen — `‹ back` there returns here. */
function plan() {
  if (idea.value) emit('go', ideaBridgePath(idea.value.trip_id, 'dayplan', idea.value.id))
}

const reopensTo = computed(() => (idea.value ? reopenedState(idea.value.state) : null))

const MENU_MOVE: Partial<Record<IdeaState, { text: string; icon: string; testid: string }>> = {
  [IDEA_STATE_IDEA]: {
    text: t('ideas.unshortlist'),
    icon: arrowUndoOutline,
    testid: 'idea-menu-unshortlist',
  },
  [IDEA_STATE_DROPPED]: {
    text: t('ideas.drop'),
    icon: removeCircleOutline,
    testid: 'idea-menu-drop',
  },
}

async function openMenu() {
  if (!idea.value) return
  const moves = menuMoves(idea.value.state).flatMap((state) => {
    const move = MENU_MOVE[state]
    return move
      ? [
          {
            text: move.text,
            icon: move.icon,
            htmlAttributes: { 'data-testid': move.testid },
            handler: () => emit('state', state),
          },
        ]
      : []
  })
  const sheet = await actionSheetController.create({
    htmlAttributes: { 'data-testid': 'idea-menu' },
    buttons: [
      {
        text: t('common.edit'),
        icon: createOutline,
        htmlAttributes: { 'data-testid': 'idea-menu-edit' },
        handler: () => emit('edit'),
      },
      ...moves,
      {
        text: t('ideas.remove'),
        icon: trashOutline,
        role: 'destructive',
        htmlAttributes: { 'data-testid': 'idea-menu-remove' },
        handler: () => emit('remove'),
      },
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
}

const pictureInput = ref<HTMLInputElement | null>(null)

const tracks = computed(() =>
  idea.value
    ? orderTracks(
        plannerStore
          .getTracks(idea.value.trip_id)
          .filter((track) => track.idea_id === idea.value!.id),
      )
    : [],
)
const trackInput = ref<HTMLInputElement | null>(null)
const chosenTrack = ref<string | null>(null)

// A track that arrives while the idea is open is chosen (FR-29.17): it is
// the one just added. What was there on opening is not.
watch(
  () => tracks.value.map((track) => track.id),
  (now, before) => {
    const added = before ? now.filter((id) => !before.includes(id)) : []
    if (added.length > 0) chosenTrack.value = added[added.length - 1]!
  },
  { immediate: true },
)

function onTrackFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('addTrack', file)
}

/** The card hands back the kernel's track; the planner's own row is looked up by it. */
function own(track: TrackFields): IdeaTrack | undefined {
  return tracks.value.find((candidate) => candidate.id === track.id)
}

function onPictureFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // The same file can be picked again after a failed upload.
  input.value = ''
  if (file) emit('addPicture', file)
}

/** The picture the viewer is open on, or null while it is closed. */
const viewing = ref<number | null>(null)

const resultSources = inject(IDEA_RESULT_SOURCES, [])

/** FR-29.13: what came of the idea, and what it can still become. */
const results = computed(() =>
  idea.value
    ? resultSources.flatMap((source) => source.results(idea.value!.trip_id, idea.value!.id))
    : [],
)
const offered = computed(() => (idea.value ? offeredResults(idea.value.state, results.value) : []))

const RESULT_ICON: Record<IdeaResultKind, string> = {
  [IDEA_RESULT_EXCURSION]: trailSignOutline,
  [IDEA_RESULT_TASK]: checkboxOutline,
  [IDEA_RESULT_SHOPPING]: cartOutline,
}

function make(kind: IdeaResultKind) {
  if (idea.value)
    emit('go', ideaBridgePath(idea.value.trip_id, IDEA_RESULT_SCREEN[kind], idea.value.id))
}

const discussion = computed(() =>
  idea.value ? ideaDiscussion(idea.value.id, plannerStore.getComments(idea.value.trip_id)) : [],
)

/** „Andy und Sia dafür" — the names behind the 👍, the sheet's line of who is for it. */
const forLine = computed(() => {
  const names = (tally.value?.up ?? []).map((id) => props.nameOf(id) ?? t('ideas.someone'))
  return names.length > 0 ? t('ideas.inFavour', { names: names.join(', ') }) : ''
})

const meta = computed(() =>
  idea.value
    ? writtenMeta(
        props.othersShown ? idea.value.author_id : null,
        idea.value.created_at,
        props.nameOf,
      )
    : '',
)

/** Where nobody else writes, every word is mine (Local Mode's one writer). */
function isMine(comment: IdeaComment): boolean {
  return props.myUserId === null || comment.author_id === props.myUserId
}

const draft = ref('')

function sendComment() {
  const body = draft.value.trim()
  if (!body) return
  emit('comment', body)
  draft.value = ''
}

/** The entry being edited in place, and its words so far — mine only (FR-29.4). */
const editingId = ref<string | null>(null)
const editDraft = ref('')

function startEdit(comment: IdeaComment) {
  editDraft.value = comment.body
  editingId.value = comment.id
}

function saveEdit(comment: IdeaComment) {
  const body = editDraft.value.trim()
  if (!body) return
  editingId.value = null
  emit('editComment', comment, body)
}

/** „Sia · heute 14:32 · bearbeitet" — who wrote it and when, and whether it changed since. */
function commentMeta(comment: IdeaComment): string {
  const written = writtenMeta(
    props.othersShown ? comment.author_id : null,
    comment.created_at,
    props.nameOf,
  )
  return comment.edited_at ? `${written} · ${t('notes.edited')}` : written
}

async function openCommentMenu(comment: IdeaComment) {
  if (!isMine(comment) || editingId.value === comment.id) return
  const sheet = await actionSheetController.create({
    htmlAttributes: { 'data-testid': 'idea-comment-menu' },
    buttons: [
      {
        text: t('common.edit'),
        icon: createOutline,
        htmlAttributes: { 'data-testid': 'idea-comment-menu-edit' },
        handler: () => startEdit(comment),
      },
      {
        text: t('ideas.removeComment'),
        icon: trashOutline,
        role: 'destructive',
        htmlAttributes: { 'data-testid': 'idea-comment-menu-remove' },
        handler: () => emit('removeComment', comment),
      },
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
}
</script>

<template>
  <section
    v-if="idea"
    class="idea-detail"
    :class="{ dropped: idea.state === IDEA_STATE_DROPPED }"
    :data-state="idea.state"
    :data-idea="idea.id"
    data-testid="idea-detail"
  >
    <SheetHead
      :title="idea.title"
      title-testid="idea-detail-title"
      close-testid="idea-detail-close"
      @close="emit('close')"
    >
      <template #trail>
        <button
          type="button"
          class="more"
          :aria-label="t('ideas.more')"
          data-testid="idea-detail-more"
          @click="openMenu"
        >
          <IonIcon :icon="ellipsisVertical" aria-hidden="true" />
        </button>
      </template>
      <template #meta>
        <span data-testid="idea-detail-meta">{{ meta }}</span>
        <span v-if="idea.tag" class="chip" data-testid="idea-detail-tag">
          {{ t(`ideas.tag.${idea.tag}`) }}
        </span>
        <span v-if="idea.rain_proof" class="chip rain" data-testid="idea-detail-rain">
          <IonIcon :icon="umbrellaOutline" aria-hidden="true" />
          {{ t('ideas.rainProofShort') }}
        </span>
      </template>
    </SheetHead>

    <div
      v-if="lead"
      class="acts"
      role="group"
      :aria-label="t('ideas.stateLabel')"
      data-testid="idea-acts"
    >
      <button
        v-if="lead === IDEA_STEP_SHORTLIST"
        type="button"
        class="act primary"
        data-testid="idea-act-shortlist"
        @click="emit('state', IDEA_STATE_SHORTLISTED)"
      >
        <IonIcon :icon="starOutline" aria-hidden="true" />
        {{ t('ideas.toShortlist') }}
      </button>
      <button
        v-else-if="plannable"
        type="button"
        class="act"
        :class="plannedText ? 'planned' : 'primary'"
        :data-planned="idea.planned_on ?? ''"
        data-testid="idea-act-plan"
        @click="plan"
      >
        <IonIcon :icon="calendarOutline" aria-hidden="true" />
        <span class="jp-num">{{ plannedText ?? t('ideas.plan') }}</span>
      </button>
      <button
        type="button"
        class="act"
        data-testid="idea-act-done"
        @click="emit('state', IDEA_STATE_DONE)"
      >
        <IonIcon :icon="checkmarkOutline" aria-hidden="true" />
        {{ t('ideas.state.done') }}
      </button>
    </div>
    <div
      v-else-if="reopensTo"
      class="status"
      :class="{ done: idea.state === IDEA_STATE_DONE }"
      :data-state="idea.state"
      data-testid="idea-status"
    >
      <span class="status-word">
        <IonIcon
          v-if="idea.state === IDEA_STATE_DONE"
          :icon="checkmarkOutline"
          aria-hidden="true"
        />
        {{ t(`ideas.state.${idea.state}`) }}
      </span>
      <button
        type="button"
        class="act"
        data-testid="idea-act-reopen"
        @click="emit('state', reopensTo)"
      >
        {{ idea.state === IDEA_STATE_DROPPED ? t('ideas.retake') : t('ideas.reopen') }}
      </button>
    </div>

    <IdeaMosaic
      v-if="pictures.length > 0"
      :pictures="pictures"
      :title="idea.title"
      @open="viewing = $event"
    />
    <div
      v-else-if="plannerStore.pictureComing(idea.id)"
      class="picture-coming"
      data-testid="idea-detail-picture-coming"
    >
      <IonSpinner name="dots" aria-hidden="true" />
      <span>{{ t('ideas.pictureComing') }}</span>
    </div>
    <div class="adds">
      <template v-if="canAddPicture(pictures)">
        <input
          ref="pictureInput"
          type="file"
          accept="image/*"
          hidden
          data-testid="idea-picture-file"
          @change="onPictureFile"
        />
        <IonButton
          fill="clear"
          size="small"
          :disabled="uploading"
          data-testid="idea-picture-add"
          @click="pictureInput?.click()"
        >
          <IonIcon slot="start" :icon="cameraOutline" />
          {{ uploading ? t('ideas.uploading') : t('ideas.addPicture') }}
        </IonButton>
        <span v-if="pictures.length > 0" class="of-max jp-num" data-testid="idea-picture-count">
          {{ t('ideas.picturesOfMax', { n: pictures.length, max: MAX_IDEA_IMAGES }) }}
        </span>
      </template>
      <template v-if="tracks.length < MAX_TRACKS">
        <input
          ref="trackInput"
          type="file"
          accept=".gpx,application/gpx+xml"
          hidden
          data-testid="idea-track-file"
          @change="onTrackFile"
        />
        <IonButton
          fill="clear"
          size="small"
          :disabled="trackBusy"
          data-testid="idea-track-add"
          @click="trackInput?.click()"
        >
          <IonIcon slot="start" :icon="mapOutline" />
          {{ trackBusy ? t('ideas.trackReading') : t('ideas.addTrack') }}
        </IonButton>
        <IonButton
          fill="clear"
          size="small"
          :disabled="trackBusy || tiles !== 'on'"
          :title="tiles !== 'on' ? t('track.editNeedsMap') : undefined"
          data-testid="idea-track-draw"
          @click="emit('editTrack', null)"
        >
          <IonIcon slot="start" :icon="gitBranchOutline" />
          {{ t('track.draw') }}
        </IonButton>
        <span v-if="tracks.length > 0" class="of-max jp-num" data-testid="idea-track-count">
          {{ t('ideas.picturesOfMax', { n: tracks.length, max: MAX_TRACKS }) }}
        </span>
      </template>
    </div>
    <TrackCard
      v-if="tracks.length > 0"
      v-model:chosen="chosenTrack"
      :tracks="tracks"
      :title="idea.title"
      :trip-id="idea.trip_id"
      @update="(track, settings) => own(track) && emit('updateTrack', own(track)!, settings)"
      @download="(track) => own(track) && emit('downloadTrack', own(track)!)"
      @replace="(track, file) => own(track) && emit('replaceTrack', own(track)!, file)"
      @remove="(track) => own(track) && emit('removeTrack', own(track)!)"
      @edit="(track) => own(track) && emit('editTrack', own(track)!)"
    />
    <IdeaPictureViewer
      :pictures="pictures"
      :title="idea.title"
      :start="viewing"
      @close="viewing = null"
      @cover="(image) => emit('coverPicture', image)"
      @remove="(image) => emit('removePicture', image)"
    />

    <a
      v-if="idea.link"
      class="link-card"
      :href="idea.link"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="idea-detail-link"
    >
      <IonIcon :icon="linkOutline" aria-hidden="true" />
      <span class="site">{{ linkSite(idea.link) }}</span>
      <IonIcon class="out" :icon="openOutline" aria-hidden="true" />
    </a>

    <p v-if="idea.note" class="note" data-testid="idea-detail-note">{{ idea.note }}</p>

    <div v-if="othersShown && tally" class="votes">
      <button
        type="button"
        class="vote"
        :aria-pressed="tally.mine === IDEA_VOTE_UP ? 'true' : 'false'"
        :aria-label="t('ideas.voteUp')"
        data-testid="idea-vote-up"
        @click="emit('vote', IDEA_VOTE_UP)"
      >
        <IonIcon :icon="thumbsUpOutline" aria-hidden="true" />
        <span class="jp-num" data-testid="idea-vote-up-count">{{ tally.up.length }}</span>
        <UserAvatar
          v-for="userId in tally.up"
          :key="userId"
          class="voter"
          :name="nameOf(userId)"
          :seed="userId"
          :size="18"
        />
      </button>
      <button
        type="button"
        class="vote"
        :aria-pressed="tally.mine === IDEA_VOTE_DOWN ? 'true' : 'false'"
        :aria-label="t('ideas.voteDown')"
        data-testid="idea-vote-down"
        @click="emit('vote', IDEA_VOTE_DOWN)"
      >
        <IonIcon :icon="thumbsDownOutline" aria-hidden="true" />
        <span class="jp-num" data-testid="idea-vote-down-count">{{ tally.down.length }}</span>
        <UserAvatar
          v-for="userId in tally.down"
          :key="userId"
          class="voter"
          :name="nameOf(userId)"
          :seed="userId"
          :size="18"
        />
      </button>
      <span v-if="forLine" class="for-line" data-testid="idea-vote-names">{{ forLine }}</span>
    </div>

    <section
      v-if="results.length > 0 || offered.length > 0"
      class="results"
      data-testid="idea-results"
    >
      <SectionHead :title="t('ideas.results')" />
      <div class="result-chips">
        <button
          v-for="result in results"
          :key="result.key"
          type="button"
          class="result"
          :class="{ done: result.done }"
          :data-testid="`idea-result-${result.key}`"
          @click="emit('go', result.path)"
        >
          <IonIcon :icon="RESULT_ICON[result.kind]" aria-hidden="true" />
          <span class="result-title">{{ result.title }}</span>
        </button>
        <button
          v-for="kind in offered"
          :key="kind"
          type="button"
          class="result offer"
          :aria-label="t(`ideas.makeLabel.${kind}`)"
          :data-testid="`idea-make-${kind}`"
          @click="make(kind)"
        >
          <IonIcon :icon="RESULT_ICON[kind]" aria-hidden="true" />
          {{ t(`ideas.make.${kind}`) }}
        </button>
      </div>
    </section>

    <section class="discussion" data-testid="idea-discussion">
      <SectionHead :title="t('ideas.discussion')" :count="discussion.length || null" />
      <div
        v-for="comment in discussion"
        :key="comment.id"
        class="comment"
        :class="{ mine: isMine(comment) }"
        :data-testid="`idea-comment-${comment.id}`"
        :role="isMine(comment) && editingId !== comment.id ? 'button' : undefined"
        :tabindex="isMine(comment) && editingId !== comment.id ? 0 : undefined"
        @click="openCommentMenu(comment)"
        @keydown.enter.self="openCommentMenu(comment)"
      >
        <UserAvatar
          v-if="othersShown"
          :name="nameOf(comment.author_id)"
          :seed="comment.author_id"
          :size="20"
        />
        <div v-if="editingId === comment.id" class="editor" data-testid="idea-comment-editor">
          <IonTextarea
            v-model="editDraft"
            auto-grow
            :rows="2"
            :aria-label="t('common.edit')"
            data-testid="idea-comment-edit-body"
          />
          <div class="editor-actions">
            <IonButton
              fill="clear"
              size="small"
              data-testid="idea-comment-edit-cancel"
              @click.stop="editingId = null"
            >
              {{ t('common.cancel') }}
            </IonButton>
            <IonButton
              size="small"
              :disabled="!editDraft.trim()"
              data-testid="idea-comment-edit-save"
              @click.stop="saveEdit(comment)"
            >
              {{ t('common.save') }}
            </IonButton>
          </div>
        </div>
        <span v-else class="words">
          <span class="body">{{ comment.body }}</span>
          <span class="when" :data-testid="`idea-comment-meta-${comment.id}`">{{
            commentMeta(comment)
          }}</span>
        </span>
      </div>
      <div class="composer">
        <IonInput
          v-model="draft"
          :placeholder="t('ideas.commentPlaceholder')"
          :aria-label="t('ideas.commentPlaceholder')"
          data-testid="idea-comment-input"
          @keydown.enter.prevent="sendComment"
        />
        <IonButton
          shape="round"
          :disabled="!draft.trim()"
          :aria-label="t('ideas.send')"
          data-testid="idea-comment-send"
          @click="sendComment"
        >
          <IonIcon slot="icon-only" :icon="send" aria-hidden="true" />
        </IonButton>
      </div>
    </section>
  </section>
</template>

<style scoped>
.idea-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 18px;
}

.idea-detail.dropped :deep(.jp-sheet-title) {
  color: var(--ct-subtext1);
  text-decoration: line-through;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-inline-start: 6px;
  padding: 1px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
}

.chip.rain {
  color: var(--jp-action);
}

.results {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* A result is a solid chip that leads to it; what the idea can still become
   is the same chip dashed (planner-concept §4.2). */
.result {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 5px 11px;
  border: 1px solid var(--jp-surface-sunken);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.result ion-icon {
  flex: none;
  color: var(--jp-action);
  font-size: var(--jp-icon-xs);
}

.result-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result.done .result-title {
  color: var(--ct-subtext0);
  text-decoration: line-through;
}

.result.offer {
  border-style: dashed;
  border-color: var(--ct-overlay0);
  background: transparent;
  color: var(--ct-subtext1);
}

.picture-coming {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  aspect-ratio: 16 / 10;
  max-width: 100%;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.adds {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: -6px 0 -4px -10px;
}

.adds:empty {
  display: none;
}

.adds ion-button {
  --color: var(--jp-action);
}

.adds .of-max {
  margin-inline-end: 8px;
}

.of-max {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.link-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--jp-action);
  text-decoration: none;
}

.link-card .site {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-card .out {
  color: var(--ct-subtext0);
}

.note {
  margin: 0;
  color: var(--ct-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* The head's ⋮ — a bare glyph beside the way out, which keeps the rim. */
.more {
  display: grid;
  place-items: center;
  width: var(--jp-control-round);
  height: var(--jp-control-round);
  flex: none;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

/* The step ahead and Gemacht: buttons, not a segment — a segment switches a
   view everywhere else in the app. */
.acts {
  display: flex;
  gap: 8px;
}

.act {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font: inherit;
  font-weight: var(--jp-weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}

.act.primary,
.act.planned {
  flex: 1.35;
}

.act.primary {
  border-color: var(--jp-action);
  background: var(--jp-action);
  color: var(--ct-base);
}

.act.planned {
  border-color: var(--jp-action);
  background: transparent;
  color: var(--jp-action);
}

.status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.status-word {
  display: inline-flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  color: var(--ct-subtext1);
  font-weight: var(--jp-weight-semibold);
}

.status.done .status-word {
  color: var(--jp-done);
}

.status .act {
  flex: none;
  min-height: 36px;
}

.votes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.vote {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 36px;
  padding: 4px 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-pill);
  background: transparent;
  color: var(--ct-text);
  font: inherit;
  cursor: pointer;
}

.vote[aria-pressed='true'] {
  border-color: var(--jp-done);
  background: color-mix(in srgb, var(--jp-done) 16%, transparent);
}

.voter + .voter {
  margin-inline-start: -6px;
}

.for-line {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.discussion {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--jp-surface-border);
}

.comment {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
}

.comment.mine {
  cursor: pointer;
}

.editor {
  flex: 1;
  min-width: 0;
}

.editor ion-textarea {
  --background: var(--jp-surface-sunken);
  --padding-start: 10px;
  --padding-end: 10px;
  border-radius: var(--jp-r-md);
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.words {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.body {
  color: var(--ct-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.when {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.composer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.composer ion-input {
  --background: var(--jp-surface-sunken);
  --padding-start: 14px;
  --padding-end: 14px;
  flex: 1;
  border-radius: var(--jp-r-pill);
}

ion-icon {
  font-size: var(--jp-icon-sm);
}

.chip ion-icon {
  font-size: var(--jp-icon-xs);
}
</style>
