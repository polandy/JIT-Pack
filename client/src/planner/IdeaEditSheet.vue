<script setup lang="ts">
/**
 * An idea written or edited (FR-29.1): the title, the link, a note, one tag
 * of the closed set (FR-29.10) and the rain mark (FR-29.12). Nothing is
 * written before the button, and the button stays off while the title is
 * blank or the link is not one the board may render.
 *
 * A link entered here names a blank title after its site, so a pasted link
 * alone can be saved. Where the instance offers it, the link's page is read
 * (FR-29.16): its title and description come as a **suggestion** that has to
 * be confirmed, and its picture is fetched in the background and added
 * after the save — only where the idea still has no picture by then.
 */
import { IonButton, IonIcon, IonInput, IonSpinner, IonTextarea } from '@ionic/vue'
import { umbrellaOutline } from 'ionicons/icons'
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
import { acceptSuggestion, fillFromLink, suggestionFrom, type PreviewText } from './domain/linkFill'

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
}>()

const emit = defineEmits<{
  close: []
  /**
   * The fields, and the picture of a link entered here — a promise, since it
   * is fetched in the background and may arrive after the save; it resolves
   * null for none. Whether the idea still wants it is the receiver's call.
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
/** What the page suggests, until it is confirmed or declined. */
const suggestion = ref<PreviewText | null>(null)
/** The link the idea came with, so an edit's own link is not read again. */
let storedLink: string | null = null
/** The site name a link placed as the title — nobody's typing. */
let placeholder: string | null = null
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

async function readPage(url: string, preview: NonNullable<typeof props.preview>) {
  const mine = ++generation
  previewState.value = PREVIEW_LOADING
  // The picture starts with the page, so a quick save finds it under way.
  void pictureOf(url, preview)
  const page = await pageOf(url, preview)
  // A link changed while its page was read is answered by its own read.
  if (mine !== generation) return
  previewState.value = PREVIEW_DONE
  suggestion.value = page ? suggestionFrom(page, { title: title.value, note: note.value }) : null
}

function acceptPreview() {
  if (!suggestion.value) return
  const accepted = acceptSuggestion({ title: title.value, note: note.value }, suggestion.value)
  title.value = accepted.title
  note.value = accepted.note
  placeholder = null
  suggestion.value = null
}

watch(
  () => (parsedLink.value.ok ? parsedLink.value.link : null),
  (url) => {
    if (timer) clearTimeout(timer)
    timer = null
    generation++
    suggestion.value = null
    previewState.value = PREVIEW_IDLE
    if (!props.open || url === null || url === storedLink) return
    // At once, not after the rest: a pasted link alone is savable.
    const byLink = fillFromLink(
      { title: title.value === placeholder ? '' : title.value, note: note.value },
      url,
    )
    title.value = byLink.text.title
    placeholder = byLink.placeholder
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
    placeholder = null
    pages.clear()
    pictures.clear()
    title.value = props.idea?.title ?? ''
    link.value = props.idea?.link ?? ''
    note.value = props.idea?.note ?? ''
    tag.value = props.idea?.tag ?? null
    rainProof.value = props.idea?.rain_proof ?? false
    suggestion.value = null
    previewState.value = PREVIEW_IDLE
  },
  { immediate: true },
)

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  generation++
})

const canSave = computed(() => title.value.trim() !== '' && parsedLink.value.ok)

/** The picture of a link entered here, fetched now if the save came first. */
function pictureToSave(url: string | null): Promise<Blob | null> {
  const preview = props.preview
  if (!preview || url === null || url === storedLink) return Promise.resolve(null)
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
      <div v-if="suggestion" class="suggestion" data-testid="idea-edit-suggestion">
        <span class="label">{{ t('ideas.suggestion') }}</span>
        <strong v-if="suggestion.title" data-testid="idea-edit-suggestion-title">
          {{ suggestion.title }}
        </strong>
        <span
          v-if="suggestion.description"
          class="description"
          data-testid="idea-edit-suggestion-description"
        >
          {{ suggestion.description }}
        </span>
        <div class="suggestion-actions">
          <IonButton
            fill="clear"
            size="small"
            data-testid="idea-edit-suggestion-dismiss"
            @click="suggestion = null"
          >
            {{ t('ideas.suggestionDismiss') }}
          </IonButton>
          <IonButton size="small" data-testid="idea-edit-suggestion-accept" @click="acceptPreview">
            {{ t('ideas.suggestionAccept') }}
          </IonButton>
        </div>
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

.suggestion {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  padding: 10px 12px 4px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.suggestion .label {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.suggestion strong {
  color: var(--ct-text);
  font-weight: var(--jp-weight-semibold);
  overflow-wrap: anywhere;
}

.suggestion .description {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.suggestion-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
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
