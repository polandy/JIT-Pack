<script setup lang="ts">
/**
 * The day plan's sheet for an entry of its own (FR-29.15): a new one on the
 * chosen day — with the shortlisted ideas without a day beside it, any of
 * which can be planned there instead — or an existing one to change or
 * delete. Nothing is written before its button.
 */
import {
  IonButton,
  IonIcon,
  IonInput,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonTextarea,
} from '@ionic/vue'
import { bulbOutline, trashOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { t } from '@/i18n'
import type { DayEntry, Idea } from '@/types/domain'
import type { DayEntryFields } from './actions'
import { isPlanTime } from './domain/dayPlan'

const props = defineProps<{
  open: boolean
  /** The entry being changed, or null for a new one. */
  entry: DayEntry | null
  /** The chosen day in words, for the head of a new one. */
  dayText: string
  /** The shortlisted ideas without a day, offered beside a new entry. */
  pool: readonly Idea[]
}>()

const emit = defineEmits<{
  close: []
  save: [fields: DayEntryFields]
  remove: []
  plan: [idea: Idea]
}>()

const ADD_ENTRY = 'entry'
const ADD_IDEA = 'idea'
type AddKind = typeof ADD_ENTRY | typeof ADD_IDEA

const kind = ref<AddKind>(ADD_ENTRY)
const title = ref('')
const note = ref('')
const time = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    kind.value = ADD_ENTRY
    title.value = props.entry?.title ?? ''
    note.value = props.entry?.note ?? ''
    time.value = props.entry?.at_time ?? ''
  },
  { immediate: true },
)

const canSave = computed(() => title.value.trim() !== '')

function onKind(event: CustomEvent) {
  const value = (event.detail as { value?: unknown }).value
  if (value === ADD_ENTRY || value === ADD_IDEA) kind.value = value
}

function save() {
  if (!canSave.value) return
  emit('save', {
    title: title.value,
    note: note.value,
    time: isPlanTime(time.value) ? time.value : null,
  })
}
</script>

<template>
  <SheetModal :is-open="open" testid="day-entry" @dismiss="emit('close')">
    <section v-if="open" class="sheet">
      <SheetHead
        :title="entry ? t('dayPlan.editTitle') : t('dayPlan.newTitle', { day: dayText })"
        title-testid="day-entry-title"
        close-testid="day-entry-close"
        @close="emit('close')"
      />
      <IonSegment
        v-if="!entry"
        :value="kind"
        class="kinds"
        data-testid="day-entry-kinds"
        @ionChange="onKind"
      >
        <IonSegmentButton :value="ADD_ENTRY" data-testid="day-entry-kind-entry">
          <IonLabel>{{ t('dayPlan.kind.entry') }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton :value="ADD_IDEA" data-testid="day-entry-kind-idea">
          <IonLabel>{{ t('dayPlan.kind.idea') }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <template v-if="kind === ADD_ENTRY">
        <IonInput
          v-model="title"
          class="title-field"
          :placeholder="t('dayPlan.titlePlaceholder')"
          :aria-label="t('dayPlan.titlePlaceholder')"
          data-testid="day-entry-name"
          @keydown.enter.prevent="save"
        />
        <IonTextarea
          v-model="note"
          auto-grow
          :rows="2"
          :placeholder="t('dayPlan.notePlaceholder')"
          :aria-label="t('dayPlan.notePlaceholder')"
          data-testid="day-entry-note"
        />
        <IonInput
          v-model="time"
          type="time"
          class="time-field"
          :label="t('dayPlan.timeLabel')"
          label-placement="stacked"
          data-testid="day-entry-time"
        />
        <div class="actions">
          <IonButton
            v-if="entry"
            fill="clear"
            color="danger"
            data-testid="day-entry-remove"
            @click="emit('remove')"
          >
            <IonIcon slot="start" :icon="trashOutline" aria-hidden="true" />
            {{ t('dayPlan.remove') }}
          </IonButton>
          <span class="spacer" />
          <IonButton shape="round" :disabled="!canSave" data-testid="day-entry-save" @click="save">
            {{ entry ? t('common.save') : t('common.add') }}
          </IonButton>
        </div>
      </template>

      <div v-else class="pool" data-testid="day-entry-pool">
        <p v-if="pool.length === 0" class="empty">{{ t('dayPlan.poolEmpty') }}</p>
        <ChoiceChip
          v-for="idea in pool"
          :key="idea.id"
          :pressed="false"
          :data-testid="`day-entry-plan-${idea.id}`"
          @click="emit('plan', idea)"
        >
          <IonIcon :icon="bulbOutline" aria-hidden="true" />
          {{ idea.title }}
        </ChoiceChip>
      </div>
    </section>
  </SheetModal>
</template>

<style scoped>
.sheet {
  padding: 4px 16px 18px;
}

.kinds {
  margin-top: 6px;
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

.time-field {
  max-width: 180px;
}

.actions {
  display: flex;
  align-items: center;
  margin-top: 14px;
}

.spacer {
  flex: 1;
}

.pool {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.pool ion-icon {
  font-size: var(--jp-icon-xs);
}

.empty {
  margin: 4px 2px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}
</style>
