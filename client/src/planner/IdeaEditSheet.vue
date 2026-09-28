<script setup lang="ts">
/**
 * An idea written or edited (FR-29.1): the title, the link, a note, one tag
 * of the closed set (FR-29.10) and the rain mark (FR-29.12). Nothing is
 * written before the button, and the button stays off while the title is
 * blank or the link is not one the board may render.
 *
 * A link entered here names a blank title after its site, and is read for
 * its page's own title, description and picture where the instance offers
 * it (FR-29.16): the words fill what is still blank as soon as they come,
 * and the picture follows on its own — offered with ✕ to decline it, and
 * added when the idea is saved, even if it arrives after the save.
 */
import { IonButton, IonIcon, IonInput, IonSpinner, IonTextarea } from '@ionic/vue'
import { close, umbrellaOutline } from 'ionicons/icons'
import { computed, onUnmounted, ref, watch } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { t } from '@/i18n'
import type { LinkPreview } from '@/sync/featureModule'
import type { Idea, IdeaTag } from '@/types/domain'
import { IDEA_TAGS } from '@/types/domain'
import type { IdeaFields } from './actions'
import { parseLink } from './domain/ideas'
import { fillFromLink, fillFromPreview } from './domain/linkFill'

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
  /** Whether a picture from the link may be offered — the idea has none yet. */
  acceptsPicture: boolean
}>()

const emit = defineEmits<{
  close: []
  /**
   * The fields, and the link's picture where it was offered and kept — a
   * promise, since the picture may still be on its way when the idea is
   * saved; it resolves null for none.
   */
  save: [fields: IdeaFields, picture: Promise<Blob | null>]
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
const picture = ref<Blob | null>(null)
const pictureUrl = ref<string | null>(null)
/** The picture on its way — the tile shows it coming, with its ✕ already. */
const pictureComing = ref(false)
let pendingPicture: Promise<Blob | null> | null = null
/** The link last read, so an unchanged link — an edit's own — is not read again. */
let readLink: string | null = null
/** The site name a link placed as the title — nobody's typing, so a page may replace it. */
let placeholder: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let generation = 0

function dropPicture() {
  if (pictureUrl.value) URL.revokeObjectURL(pictureUrl.value)
  pictureUrl.value = null
  picture.value = null
  pictureComing.value = false
  pendingPicture = null
}

async function readPage(url: string, preview: NonNullable<typeof props.preview>) {
  const mine = ++generation
  previewState.value = PREVIEW_LOADING
  const page = await preview.read(url)
  // A link changed while its page was read is answered by its own read.
  if (mine !== generation) return
  readLink = url
  previewState.value = PREVIEW_DONE
  if (!page) return
  const filled = fillFromPreview({ title: title.value, note: note.value }, page, placeholder)
  title.value = filled.title
  note.value = filled.note
  if (page.imageUrl && props.acceptsPicture) {
    dropPicture()
    pictureComing.value = true
    const coming = preview.picture(page.imageUrl)
    pendingPicture = coming
    const blob = await coming
    // Declined with ✕, or another link since: this picture is not wanted.
    if (pendingPicture !== coming) return
    pendingPicture = null
    pictureComing.value = false
    if (!blob) return
    picture.value = blob
    pictureUrl.value = URL.createObjectURL(blob)
  }
}

/** What the save hands on: the kept picture, the one still coming, or none. */
function pictureToSave(): Promise<Blob | null> {
  if (picture.value) return Promise.resolve(picture.value)
  const coming = pendingPicture
  if (!coming) return Promise.resolve(null)
  // A ✕ after the save cannot happen — the sheet is closed — so what is
  // coming is kept.
  return coming
}

watch(
  () => (parsedLink.value.ok ? parsedLink.value.link : null),
  (url) => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!props.open || url === null || url === readLink) return
    // At once, not after the rest: a pasted link alone is savable.
    const byLink = fillFromLink(
      { title: title.value === placeholder ? '' : title.value, note: note.value },
      url,
    )
    title.value = byLink.text.title
    placeholder = byLink.placeholder
    generation++
    previewState.value = PREVIEW_IDLE
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
    title.value = props.idea?.title ?? ''
    link.value = props.idea?.link ?? ''
    note.value = props.idea?.note ?? ''
    tag.value = props.idea?.tag ?? null
    rainProof.value = props.idea?.rain_proof ?? false
    readLink = props.idea?.link ?? null
    placeholder = null
    dropPicture()
    previewState.value = PREVIEW_IDLE
  },
  { immediate: true },
)

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  generation++
  dropPicture()
})

const canSave = computed(() => title.value.trim() !== '' && parsedLink.value.ok)

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
    pictureToSave(),
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
        :placeholder="t('ideas.titlePlaceholder')"
        :aria-label="t('ideas.titlePlaceholder')"
        data-testid="idea-edit-name"
        @keydown.enter.prevent="save"
      />
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
        v-if="pictureUrl || pictureComing"
        class="suggested"
        data-testid="idea-edit-preview-picture"
        :data-coming="pictureComing ? 'true' : undefined"
      >
        <img
          v-if="pictureUrl"
          :src="pictureUrl"
          :alt="t('ideas.previewPicture')"
          @error="dropPicture"
        />
        <span v-else class="coming"><IonSpinner name="dots" aria-hidden="true" /></span>
        <span class="caption">{{
          pictureUrl ? t('ideas.previewPicture') : t('ideas.previewPictureComing')
        }}</span>
        <button
          type="button"
          class="drop"
          :aria-label="t('ideas.previewPictureDrop')"
          data-testid="idea-edit-preview-picture-drop"
          @click="dropPicture"
        >
          <IonIcon :icon="close" aria-hidden="true" />
        </button>
      </div>
      <IonTextarea
        v-model="note"
        auto-grow
        :rows="2"
        :placeholder="t('ideas.notePlaceholder')"
        :aria-label="t('ideas.notePlaceholder')"
        data-testid="idea-edit-note"
      />
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

.suggested {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 6px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.coming {
  display: grid;
  place-items: center;
  width: 84px;
  aspect-ratio: 16 / 10;
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-page);
  color: var(--ct-subtext0);
}

.suggested img {
  width: 84px;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  border-radius: var(--jp-r-sm);
}

.caption {
  flex: 1;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.drop {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ct-subtext0);
  cursor: pointer;
}

.drop ion-icon {
  font-size: var(--jp-icon-sm);
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
