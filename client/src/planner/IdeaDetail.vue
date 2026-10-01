<script setup lang="ts">
/**
 * One idea, opened (FR-29.2–29.5, FR-29.17): who wrote it and when, its
 * pictures as a mosaic, its GPX tracks on a map, the link as a card, the note, the four states set by hand, the votes with the voters'
 * names, and the discussion with its field at the foot. The same body is the
 * phone's sheet and the desktop's side panel (ADR-064), so what it does is
 * handed to the screen as events rather than written here.
 *
 * Votes and the author's name appear only where somebody else reads them
 * (FR-29.3's G-8); the discussion stays, as a place to note things down.
 *
 * On the shortlist, and while the trip has its dates, the idea is given a
 * day and an optional time here (FR-29.14) — the day plan's way in from M28.
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
  cameraOutline,
  createOutline,
  gitBranchOutline,
  linkOutline,
  mapOutline,
  openOutline,
  send,
  thumbsDownOutline,
  thumbsUpOutline,
  trashOutline,
  umbrellaOutline,
} from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import TrackCard from '@/components/global/TrackCard.vue'
import { MAX_TRACKS, orderTracks } from '@/domain/track'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { t } from '@/i18n'
import { useTileState } from '@/lib/mapTiles'
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
import { IDEA_STATE_SHORTLISTED, IDEA_STATES, IDEA_VOTE_DOWN, IDEA_VOTE_UP } from '@/types/domain'
import { isPlanTime } from './domain/dayPlan'
import { ideaDiscussion, linkSite, voteTally } from './domain/ideas'
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
  plan: [day: string | null, time: string | null]
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

/** FR-29.14: a day is given on the shortlist, and only while the trip has its days. */
const plannable = computed(
  () => idea.value?.state === IDEA_STATE_SHORTLISTED && props.days.length > 0,
)

function chooseDay(day: string | null) {
  if (!idea.value || day === idea.value.planned_on) return
  emit('plan', day, idea.value.planned_at)
}

function onTime(event: CustomEvent) {
  if (!idea.value?.planned_on) return
  const value = String((event.detail as { value?: unknown }).value ?? '')
  emit('plan', idea.value.planned_on, isPlanTime(value) ? value : null)
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
  <section v-if="idea" class="idea-detail" data-testid="idea-detail">
    <SheetHead
      :title="idea.title"
      title-testid="idea-detail-title"
      close-testid="idea-detail-close"
      @close="emit('close')"
    >
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

    <div class="states" role="group" :aria-label="t('ideas.stateLabel')">
      <button
        v-for="state in IDEA_STATES"
        :key="state"
        type="button"
        class="state"
        :aria-pressed="idea.state === state ? 'true' : 'false'"
        :data-testid="`idea-state-${state}`"
        @click="idea.state !== state && emit('state', state)"
      >
        {{ t(`ideas.state.${state}`) }}
      </button>
    </div>

    <section v-if="plannable" class="plan" data-testid="idea-plan">
      <SectionHead :title="t('ideas.planDay')" />
      <div class="days">
        <ChoiceChip
          v-for="day in days"
          :key="day"
          :pressed="idea.planned_on === day"
          :data-testid="`idea-plan-day-${day}`"
          @click="chooseDay(day)"
        >
          {{ shortDueDay(day) }}
        </ChoiceChip>
        <ChoiceChip
          :pressed="idea.planned_on === null"
          data-testid="idea-plan-none"
          @click="chooseDay(null)"
        >
          {{ t('ideas.planNone') }}
        </ChoiceChip>
      </div>
      <IonInput
        v-if="idea.planned_on"
        type="time"
        class="plan-time"
        :label="t('ideas.planTime')"
        label-placement="stacked"
        :value="idea.planned_at ?? ''"
        data-testid="idea-plan-time"
        @ionChange="onTime"
      />
    </section>

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

    <div class="foot">
      <IonButton fill="clear" size="small" data-testid="idea-detail-edit" @click="emit('edit')">
        <IonIcon slot="start" :icon="createOutline" aria-hidden="true" />
        {{ t('common.edit') }}
      </IonButton>
      <IonButton
        fill="clear"
        size="small"
        color="danger"
        data-testid="idea-detail-remove"
        @click="emit('remove')"
      >
        <IonIcon slot="start" :icon="trashOutline" aria-hidden="true" />
        {{ t('ideas.remove') }}
      </IonButton>
    </div>
  </section>
</template>

<style scoped>
.idea-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 18px;
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

/* The four states as one segmented control — the sheet's own, where a
   segment bar would take the whole width twice. */
.states {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.state {
  padding: 7px 4px;
  border: 0;
  border-radius: var(--jp-r-sm);
  background: transparent;
  color: var(--ct-subtext1);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.state[aria-pressed='true'] {
  background: var(--jp-action);
  color: var(--ct-base);
  font-weight: var(--jp-weight-semibold);
}

.plan .days {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.plan-time {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  max-width: 180px;
  margin-top: 8px;
  border-radius: var(--jp-r-md);
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

.foot {
  display: flex;
  justify-content: space-between;
}

ion-icon {
  font-size: var(--jp-icon-sm);
}

.chip ion-icon {
  font-size: var(--jp-icon-xs);
}
</style>
