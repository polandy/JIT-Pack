<script setup lang="ts">
/**
 * FR-29.21: the idea's *Vorbereitung* — what has to be done ahead of it, a
 * bus reserved or a place booked by phone, each with its lead before the
 * idea's day. It stands in every state, so a step can be noted the moment
 * somebody thinks of it; it falls due only once the idea has a day.
 *
 * A step is a trip task the packing side owns, read and written through the
 * bridge (`IDEA_PREPARATIONS`), so it is ticked off here and on M25 alike.
 * Its line is M25's: the words, the lead under them, the due pill, the tick
 * at the row's edge. Without the bridge — a spec, a build without the
 * kernel's port — the section is not drawn.
 */
import { IonButton, IonIcon, IonInput, IonLabel } from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import DueBadge from '@/components/global/DueBadge.vue'
import ListRow from '@/components/global/ListRow.vue'
import ListRows from '@/components/global/ListRows.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import type { IdeaPreparation } from '@/domain/shared/ideaBridge'
import { PREPARATION_LEADS, preparationDue, type IdeaDay } from '@/domain/shared/ideaPreparation'
import { t } from '@/i18n'
import { IDEA_PREPARATIONS } from '@/kernel/ideaBridge'
import { shortDueDay } from '@/lib/taskDueText'
import { leadName } from './preparationText'
import type { Idea } from './types'
import { IDEA_STATE_DROPPED } from './types'

const props = defineProps<{ idea: Idea }>()

const preparations = inject(IDEA_PREPARATIONS, null)
const orchestrator = useOrchestrator()
const today = computed(() => orchestrator.today())

/** The lead a new step is offered with — a week, the owner's „typically". */
const DEFAULT_LEAD = 7

const steps = computed(() => preparations?.steps(props.idea.trip_id, props.idea.id) ?? [])
const openCount = computed(() => steps.value.filter((step) => !step.done).length)
const countLine = computed(() => {
  if (steps.value.length === 0) return null
  return openCount.value > 0
    ? t('ideas.prep.openCount', { n: openCount.value })
    : t('ideas.prep.allDone')
})

const ideaDay = computed<IdeaDay>(() => ({
  plannedOn: props.idea.planned_on ?? null,
  dropped: props.idea.state === IDEA_STATE_DROPPED,
}))

function dueOf(leadDays: number): string | null {
  return preparationDue(leadDays, ideaDay.value)
}

/** The step the sheet is open on: null while it is closed, `'new'` for one being written. */
const editing = ref<IdeaPreparation | 'new' | null>(null)
const title = ref('')
const lead = ref<number>(DEFAULT_LEAD)

function openNew() {
  title.value = ''
  lead.value = DEFAULT_LEAD
  editing.value = 'new'
}

function openStep(step: IdeaPreparation) {
  title.value = step.title
  lead.value = step.leadDays
  editing.value = step
}

/** What the chosen lead makes due, said under the chips (FR-29.21). */
const leadOut = computed(() => {
  if (ideaDay.value.dropped) return t('ideas.prep.waitsDropped')
  const due = dueOf(lead.value)
  if (due === null) return t('ideas.prep.waits')
  if (due < today.value) return t('ideas.prep.tooLate')
  return t('ideas.prep.dueOn', { day: shortDueDay(due) })
})

function save() {
  const words = title.value.trim()
  if (!preparations || !words || editing.value === null) return
  const { trip_id: tripId, id: ideaId } = props.idea
  if (editing.value === 'new') {
    preparations.add(tripId, ideaId, words, lead.value, dueOf(lead.value))
  } else {
    preparations.edit(tripId, editing.value.id, words, lead.value)
  }
  editing.value = null
}

function remove() {
  if (!preparations || editing.value === null || editing.value === 'new') return
  preparations.remove(props.idea.trip_id, editing.value.id)
  editing.value = null
}

function toggle(step: IdeaPreparation) {
  preparations?.toggle(props.idea.trip_id, step.id)
}
</script>

<template>
  <section v-if="preparations" class="prep" data-testid="idea-prep">
    <SectionHead :title="t('ideas.prep.title')" :count="countLine" />
    <ListRows v-if="steps.length > 0">
      <ListRow
        v-for="step in steps"
        :key="step.id"
        lines="full"
        :checked="step.done"
        :done="step.done"
        :tick-label="step.title"
        :data-testid="`idea-prep-${step.title}`"
        @tick="toggle(step)"
      >
        <IonLabel
          class="words"
          role="button"
          tabindex="0"
          @click="openStep(step)"
          @keydown.enter="openStep(step)"
        >
          {{ step.title }}
        </IonLabel>
        <template #facts>
          <span :data-testid="`idea-prep-lead-${step.title}`">{{ leadName(step.leadDays) }}</span>
          <span
            v-if="!step.done && dueOf(step.leadDays) === null"
            class="waits"
            :data-testid="`idea-prep-waits-${step.title}`"
            >{{ t('ideas.prep.waitsShort') }}</span
          >
        </template>
        <template #end>
          <DueBadge
            slot="end"
            :day="step.done ? null : dueOf(step.leadDays)"
            :today="today"
            :testid="`idea-prep-due-${step.title}`"
          />
        </template>
      </ListRow>
    </ListRows>
    <button type="button" class="add" data-testid="idea-prep-add" @click="openNew">
      <IonIcon :icon="addOutline" aria-hidden="true" />
      {{ t('ideas.prep.add') }}
    </button>

    <SheetModal :is-open="editing !== null" testid="idea-prep-sheet" @dismiss="editing = null">
      <section v-if="editing !== null" class="sheet">
        <SheetHead
          :title="t('ideas.prep.title')"
          :meta="t('ideas.prep.for', { title: idea.title })"
          close-testid="idea-prep-close"
          @close="editing = null"
        />
        <span class="jp-eyebrow">{{ t('ideas.prep.what') }}</span>
        <IonInput
          v-model="title"
          class="what"
          :aria-label="t('ideas.prep.what')"
          :placeholder="t('ideas.prep.placeholder')"
          data-testid="idea-prep-title"
          @keydown.enter.prevent="save"
        />
        <span class="jp-eyebrow">{{ t('ideas.prep.when') }}</span>
        <div class="leads" role="group" :aria-label="t('ideas.prep.when')">
          <ChoiceChip
            v-for="one in PREPARATION_LEADS"
            :key="one"
            :pressed="one === lead"
            :data-testid="`idea-prep-lead-choice-${one}`"
            @click="lead = one"
          >
            {{ leadName(one) }}
          </ChoiceChip>
        </div>
        <p class="lead-out jp-num" data-testid="idea-prep-lead-out">{{ leadOut }}</p>
        <div class="actions">
          <IonButton
            expand="block"
            shape="round"
            :disabled="title.trim() === ''"
            data-testid="idea-prep-save"
            @click="save"
          >
            {{ editing === 'new' ? t('ideas.prep.addSave') : t('ideas.prep.save') }}
          </IonButton>
          <IonButton
            v-if="editing !== 'new'"
            fill="clear"
            size="small"
            color="danger"
            data-testid="idea-prep-remove"
            @click="remove"
          >
            {{ t('ideas.prep.remove') }}
          </IonButton>
        </div>
      </section>
    </SheetModal>
  </section>
</template>

<style scoped>
.prep {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.words {
  cursor: pointer;
}

.waits {
  padding: 0 7px;
  border: 1px dashed var(--jp-surface-border);
  border-radius: var(--jp-r-pill);
}

.add {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--jp-action);
  font: inherit;
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.add ion-icon {
  font-size: var(--jp-icon-sm);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.what {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  margin-bottom: 6px;
  border-radius: var(--jp-r-md);
}

.leads {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.lead-out {
  margin: 2px 2px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
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
</style>
