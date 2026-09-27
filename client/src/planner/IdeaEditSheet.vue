<script setup lang="ts">
/**
 * An idea written or edited (FR-29.1): the title, the link, a note, one tag
 * of the closed set (FR-29.10) and the rain mark (FR-29.12). Nothing is
 * written before the button, and the button stays off while the title is
 * blank or the link is not one the board may render.
 */
import { IonButton, IonIcon, IonInput, IonTextarea } from '@ionic/vue'
import { umbrellaOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { t } from '@/i18n'
import type { Idea, IdeaTag } from '@/types/domain'
import { IDEA_TAGS } from '@/types/domain'
import type { IdeaFields } from './actions'
import { parseLink } from './domain/ideas'

const props = defineProps<{
  open: boolean
  /** The idea being edited; absent for a new one. */
  idea?: Idea | null
}>()

const emit = defineEmits<{
  close: []
  save: [fields: IdeaFields]
}>()

const title = ref('')
const link = ref('')
const note = ref('')
const tag = ref<IdeaTag | null>(null)
const rainProof = ref(false)

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
  },
  { immediate: true },
)

const parsedLink = computed(() => parseLink(link.value))
const canSave = computed(() => title.value.trim() !== '' && parsedLink.value.ok)

function save() {
  const parsed = parsedLink.value
  if (!canSave.value || !parsed.ok) return
  emit('save', {
    title: title.value,
    note: note.value,
    link: parsed.link,
    tag: tag.value,
    rainProof: rainProof.value,
  })
}
</script>

<template>
  <SheetModal :is-open="open" testid="idea-edit" @dismiss="emit('close')">
    <section v-if="open" class="sheet">
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
