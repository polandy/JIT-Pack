<script setup lang="ts">
/**
 * An idea written or edited (FR-29.1): the title, the link, a note, one tag
 * of the closed set (FR-29.10) and the rain mark (FR-29.12). Nothing is
 * written before the button, and the button stays off while the title is
 * blank or the link is not one the board may render.
 *
 * A link entered here brings a **suggestion** that changes nothing until it
 * is confirmed (FR-29.16): the page's own title and description where the
 * instance can read it, the link's site as a title otherwise — each shown
 * at its own field, grey in a blank one, with *Übernehmen* beside it. Its picture
 * is fetched in the background — the sheet shows it coming — and added
 * after the save, only where the idea still has no picture by then.
 */
import { IonButton, IonIcon, IonInput, IonSpinner, IonTextarea } from '@ionic/vue'
import { umbrellaOutline } from 'ionicons/icons'
import { computed, onUnmounted, ref, watch } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { t } from '@/i18n'
import type { LinkPreview } from '@/sync/featureModule'
import type { Idea, IdeaTag } from './types'
import { IDEA_TAGS } from './types'
import type { IdeaFields } from './actions'
import { parseLink } from './domain/ideas'
import { acceptPart, suggestionFor, type PreviewText, type SuggestedField } from './domain/linkFill'

/** How long a link rests before its page is read — typing is not pasting. */
const PREVIEW_DELAY_MS = 600

const props = defineProps<{
  open: boolean
  /** The idea being edited; absent for a new one. */
  idea?: Idea | null
  /**
   * Reads a link's page and then its picture (FR-29.16); null where no read
   * can be had — Local Mode, an instance with previews off — so none is
   * shown starting.
   */
  preview: {
    read(url: string): Promise<LinkPreview | null>
    picture(imageUrl: string): Promise<Blob | null>
  } | null
  /** Whether the idea has pictures already — then a link brings none. */
  hasPictures: boolean
}>()

const emit = defineEmits<{
  close: []
  /**
   * The fields, and the picture of a link entered here — a promise, since it
   * is fetched in the background and may arrive after the save, resolving
   * null for none; null where none is on its way. Whether the idea still
   * wants it when it comes is the receiver's call.
   */
  save: [fields: IdeaFields, picture: Promise<Blob | null> | null]
}>()

const title = ref('')
const link = ref('')
const parsedLink = computed(() => parseLink(link.value))
const note = ref('')
const tag = ref<IdeaTag | null>(null)
const rainProof = ref(false)

// --- the link's page (FR-29.16) ---

const PREVIEW_IDLE = 'idle'
const PREVIEW_LOADING = 'loading'
const PREVIEW_DONE = 'done'
type PreviewState = typeof PREVIEW_IDLE | typeof PREVIEW_LOADING | typeof PREVIEW_DONE

/** Where the read stands — on the sheet as `data-preview`, the case's signal. */
const previewState = ref<PreviewState>(PREVIEW_IDLE)
/** What the link suggests, until it is confirmed or declined. */
const suggestion = ref<PreviewText | null>(null)
/** The link's picture as the sheet shows it: coming, or there to be added. */
const pictureComing = ref(false)
const pictureUrl = ref<string | null>(null)
/** The link the idea came with, so an edit's own link is not read again. */
let storedLink: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let generation = 0

// One read per link and sheet: the suggestion and the background picture
// share the page's read, and a link typed back to an earlier one is not
// read twice.
const pages = new Map<string, Promise<LinkPreview | null>>()
const pictures = new Map<string, Promise<Blob | null>>()

function pageOf(url: string, preview: NonNullable<typeof props.preview>) {
  let page = pages.get(url)
  if (!page) {
    page = preview.read(url)
    pages.set(url, page)
  }
  return page
}

function pictureOf(url: string, preview: NonNullable<typeof props.preview>) {
  let picture = pictures.get(url)
  if (!picture) {
    picture = pageOf(url, preview).then((page) =>
      page?.imageUrl ? preview.picture(page.imageUrl) : null,
    )
    pictures.set(url, picture)
  }
  return picture
}

function clearPicture() {
  if (pictureUrl.value) URL.revokeObjectURL(pictureUrl.value)
  pictureUrl.value = null
  pictureComing.value = false
}

function currentText() {
  return { title: title.value, note: note.value }
}

async function showPicture(url: string, preview: NonNullable<typeof props.preview>, mine: number) {
  if (props.hasPictures) return
  pictureComing.value = true
  const blob = await pictureOf(url, preview)
  if (mine !== generation) return
  pictureComing.value = false
  if (blob) pictureUrl.value = URL.createObjectURL(blob)
}

async function readPage(url: string, preview: NonNullable<typeof props.preview>) {
  const mine = generation
  previewState.value = PREVIEW_LOADING
  // The picture starts with the page, so a quick save finds it under way.
  void showPicture(url, preview, mine)
  const page = await pageOf(url, preview)
  // A link changed while its page was read is answered by its own read.
  if (mine !== generation) return
  previewState.value = PREVIEW_DONE
  suggestion.value = suggestionFor(url, page, currentText())
}

/** Confirms one field's half of the suggestion, at that field. */
function acceptField(field: SuggestedField) {
  if (!suggestion.value) return
  const accepted = acceptPart(currentText(), suggestion.value, field)
  title.value = accepted.text.title
  note.value = accepted.text.note
  suggestion.value = accepted.rest
}

watch(
  () => (parsedLink.value.ok ? parsedLink.value.link : null),
  (url) => {
    if (timer) clearTimeout(timer)
    timer = null
    generation++
    clearPicture()
    previewState.value = PREVIEW_IDLE
    if (!props.open || url === null || url === storedLink) {
      suggestion.value = null
      return
    }
    // At once: the site as a title, so a link alone is one tap from saving —
    // replaced by the page's own words where they come.
    suggestion.value = suggestionFor(url, null, currentText())
    const preview = props.preview
    if (preview) timer = setTimeout(() => void readPage(url, preview), PREVIEW_DELAY_MS)
  },
)

// Filled from the idea each time the sheet opens, so an edit starts from what
// is stored now rather than from the last time the sheet was open.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    storedLink = props.idea?.link ?? null
    pages.clear()
    pictures.clear()
    title.value = props.idea?.title ?? ''
    link.value = props.idea?.link ?? ''
    note.value = props.idea?.note ?? ''
    tag.value = props.idea?.tag ?? null
    rainProof.value = props.idea?.rain_proof ?? false
    suggestion.value = null
    clearPicture()
    previewState.value = PREVIEW_IDLE
  },
  { immediate: true },
)

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  generation++
  clearPicture()
})

const canSave = computed(() => title.value.trim() !== '' && parsedLink.value.ok)

/**
 * The picture of a link entered here, fetched now if the save came first —
 * or null where none is on its way, so the board shows nothing coming.
 */
function pictureToSave(url: string | null): Promise<Blob | null> | null {
  const preview = props.preview
  if (!preview || props.hasPictures || url === null || url === storedLink) return null
  return pictureOf(url, preview)
}

function save() {
  const parsed = parsedLink.value
  if (!canSave.value || !parsed.ok) return
  emit(
    'save',
    {
      title: title.value,
      note: note.value,
      link: parsed.link,
      tag: tag.value,
      rainProof: rainProof.value,
    },
    pictureToSave(parsed.link),
  )
}
</script>

<template>
  <SheetModal :is-open="open" testid="idea-edit" @dismiss="emit('close')">
    <section v-if="open" class="sheet" :data-preview="previewState">
      <SheetHead
        :title="idea ? t('ideas.editTitle') : t('ideas.newTitle')"
        title-testid="idea-edit-title"
        close-testid="idea-edit-close"
        @close="emit('close')"
      />
      <IonInput
        v-model="title"
        class="title-field"
        :placeholder="suggestion?.title ?? t('ideas.titlePlaceholder')"
        :aria-label="t('ideas.titlePlaceholder')"
        data-testid="idea-edit-name"
        @keydown.enter.prevent="save"
      >
        <IonButton
          v-if="suggestion?.title"
          slot="end"
          fill="clear"
          size="small"
          data-testid="idea-edit-name-accept"
          @click="acceptField('title')"
        >
          {{ t('ideas.suggestionAccept') }}
        </IonButton>
      </IonInput>
      <p
        v-if="suggestion?.title && title.trim() !== ''"
        class="suggested-line"
        data-testid="idea-edit-name-suggestion"
      >
        {{ t('ideas.suggestedAs', { text: suggestion.title }) }}
      </p>
      <IonInput
        v-model="link"
        type="url"
        inputmode="url"
        :placeholder="t('ideas.linkPlaceholder')"
        :aria-label="t('ideas.linkPlaceholder')"
        data-testid="idea-edit-link"
      />
      <p v-if="!parsedLink.ok" class="invalid" data-testid="idea-edit-link-invalid">
        {{ t('ideas.linkInvalid') }}
      </p>
      <p
        v-else-if="previewState === PREVIEW_LOADING"
        class="reading"
        data-testid="idea-edit-preview-loading"
      >
        <IonSpinner name="dots" aria-hidden="true" />
        {{ t('ideas.previewLoading') }}
      </p>
      <div
        v-if="pictureComing || pictureUrl"
        class="picture-row"
        data-testid="idea-edit-link-picture"
        :data-coming="pictureComing ? 'true' : undefined"
      >
        <img v-if="pictureUrl" :src="pictureUrl" alt="" @error="clearPicture" />
        <span v-else class="coming"><IonSpinner name="dots" aria-hidden="true" /></span>
        <span>{{ pictureUrl ? t('ideas.linkPictureReady') : t('ideas.linkPictureComing') }}</span>
      </div>
      <IonTextarea
        v-model="note"
        auto-grow
        :rows="2"
        :placeholder="suggestion?.description ?? t('ideas.notePlaceholder')"
        :aria-label="t('ideas.notePlaceholder')"
        data-testid="idea-edit-note"
      >
        <IonButton
          v-if="suggestion?.description"
          slot="end"
          fill="clear"
          size="small"
          data-testid="idea-edit-note-accept"
          @click="acceptField('note')"
        >
          {{ t('ideas.suggestionAccept') }}
        </IonButton>
      </IonTextarea>
      <p
        v-if="suggestion?.description && note.trim() !== ''"
        class="suggested-line"
        data-testid="idea-edit-note-suggestion"
      >
        {{ t('ideas.suggestedAs', { text: suggestion.description }) }}
      </p>
      <div class="chips" role="group" :aria-label="t('ideas.tagLabel')">
        <ChoiceChip
          v-for="key in IDEA_TAGS"
          :key="key"
          :pressed="tag === key"
          :data-testid="`idea-edit-tag-${key}`"
          @click="tag = tag === key ? null : key"
        >
          {{ t(`ideas.tag.${key}`) }}
        </ChoiceChip>
      </div>
      <div class="chips">
        <ChoiceChip
          :pressed="rainProof"
          data-testid="idea-edit-rain"
          @click="rainProof = !rainProof"
        >
          <IonIcon :icon="umbrellaOutline" aria-hidden="true" />
          {{ t('ideas.rainProof') }}
        </ChoiceChip>
      </div>
      <div class="actions">
        <IonButton fill="clear" data-testid="idea-edit-cancel" @click="emit('close')">
          {{ t('common.cancel') }}
        </IonButton>
        <IonButton shape="round" :disabled="!canSave" data-testid="idea-edit-save" @click="save">
          {{ idea ? t('common.save') : t('ideas.add') }}
        </IonButton>
      </div>
    </section>
  </SheetModal>
</template>

<style scoped>
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

.invalid {
  margin: 6px 2px 0;
  color: var(--ion-color-danger);
  font-size: var(--jp-text-xs);
}

.reading {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 2px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.reading ion-spinner {
  width: 18px;
  height: 14px;
}

.suggested-line {
  margin: 4px 2px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  overflow-wrap: anywhere;
}

.picture-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.picture-row img,
.picture-row .coming {
  width: 56px;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  border-radius: var(--jp-r-sm);
}

.picture-row .coming {
  display: grid;
  place-items: center;
  background: var(--jp-surface-sunken);
}

.picture-row ion-spinner {
  width: 18px;
  height: 14px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.chips ion-icon {
  vertical-align: -2px;
  font-size: var(--jp-icon-xs);
}

.actions {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
}
</style>
