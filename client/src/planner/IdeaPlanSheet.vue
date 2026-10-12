<script setup lang="ts">
/**
 * M29's sheet for one idea from the shortlist (FR-29.14): the idea chosen,
 * its day and an optional time — what M28's *Einplanen…* opens. The day plan
 * behind it follows the day once it is saved, so the person lands where the
 * idea now stands; one already planned can lose its day here too.
 */
import { IonButton, IonIcon } from '@ionic/vue'
import { bulbOutline } from 'ionicons/icons'
import { nextTick, ref, watch } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import TimeField from '@/components/global/TimeField.vue'
import { t } from '@/i18n'
import { shortDueDay } from '@/lib/taskDueText'
import type { Idea } from './types'
import { isPlanTime } from './domain/dayPlan'

const props = defineProps<{
  /** The idea being planned; the sheet is open while there is one. */
  idea: Idea | null
  /** The trip's days, `YYYY-MM-DD`. */
  days: readonly string[]
  /** The day it opens on where the idea has none of the trip's yet — the plan's chosen day. */
  fallbackDay: string | null
}>()

const emit = defineEmits<{
  close: []
  save: [day: string, time: string | null]
  unplan: []
}>()

const day = ref<string | null>(null)
const time = ref('')
const dayRow = ref<HTMLElement | null>(null)

watch(
  () => props.idea,
  async (idea) => {
    if (!idea) return
    const own = idea.planned_on && props.days.includes(idea.planned_on) ? idea.planned_on : null
    day.value = own ?? props.fallbackDay ?? props.days[0] ?? null
    time.value = isPlanTime(idea.planned_at) ? idea.planned_at : ''
    // The chosen day is shown even where it lies past the row's first width.
    await nextTick()
    dayRow.value
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  },
  { immediate: true },
)

function save() {
  if (day.value) emit('save', day.value, isPlanTime(time.value) ? time.value : null)
}
</script>

<template>
  <SheetModal :is-open="idea !== null" testid="m29-idea-plan" @dismiss="emit('close')">
    <section v-if="idea" class="sheet" data-testid="m29-idea-plan-body">
      <SheetHead
        :title="t('dayPlan.planIdeaTitle', { day: day ? shortDueDay(day) : '' })"
        title-testid="m29-idea-plan-title"
        close-testid="m29-idea-plan-close"
        @close="emit('close')"
      />

      <span class="jp-eyebrow">{{ t('dayPlan.poolSuggest') }}</span>
      <p class="chosen" data-testid="m29-idea-plan-idea">
        <IonIcon :icon="bulbOutline" aria-hidden="true" />
        <span>{{ idea.title }}</span>
      </p>

      <span class="jp-eyebrow">{{ t('ideas.planDay') }}</span>
      <div ref="dayRow" class="days">
        <ChoiceChip
          v-for="one in days"
          :key="one"
          :pressed="one === day"
          :data-testid="`m29-idea-plan-day-${one}`"
          @click="day = one"
        >
          {{ shortDueDay(one) }}
        </ChoiceChip>
      </div>

      <TimeField
        v-model="time"
        class="time"
        :label="t('ideas.planTime')"
        label-placement="stacked"
        data-testid="m29-idea-plan-time"
      />

      <div class="actions">
        <IonButton
          expand="block"
          shape="round"
          :disabled="!day"
          data-testid="m29-idea-plan-save"
          @click="save"
        >
          {{ t('dayPlan.planIdeaSave') }}
        </IonButton>
        <IonButton
          v-if="idea.planned_on"
          fill="clear"
          size="small"
          data-testid="m29-idea-plan-none"
          @click="emit('unplan')"
        >
          {{ t('dayPlan.planIdeaNone') }}
        </IonButton>
      </div>
    </section>
  </SheetModal>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 16px 18px;
}

.chosen {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 6px;
  padding: 10px 12px;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font-weight: var(--jp-weight-semibold);
}

/* One row that scrolls sideways: a fortnight's days would otherwise wrap
   into a block of chips. */
.days {
  display: flex;
  gap: 6px;
  margin: 0 -16px 6px;
  padding: 0 16px 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.days > * {
  flex: none;
}

.time {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  max-width: 180px;
  border-radius: var(--jp-r-md);
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 10px;
}

.actions ion-button[expand='block'] {
  width: 100%;
}

ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
