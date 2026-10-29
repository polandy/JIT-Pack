<script setup lang="ts">
/**
 * FR-29.21: the day-plan entry's *Vorbereitung* — what has to be done ahead of
 * it, a table reserved or tickets bought, each with its lead before the
 * entry's day. Written in the edit sheet only: a new entry has no id for a
 * step to name yet.
 *
 * A step is a trip task the packing side owns, read and written through the
 * bridge (`ENTRY_PREPARATIONS`), so it is ticked off here and on M25 alike.
 * Its line is M25's: the words, the lead under them, the due pill, the tick at
 * the row's edge. Without the bridge — a spec, a build without the kernel's
 * port — the section is not drawn.
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
import { entryStepDue } from '@/domain/shared/entryPreparation'
import type { EntryPreparation } from '@/domain/shared/ideaBridge'
import { PREPARATION_LEADS } from '@/domain/shared/ideaPreparation'
import { t } from '@/i18n'
import { ENTRY_PREPARATIONS } from '@/kernel/ideaBridge'
import { shortDueDay } from '@/lib/taskDueText'
import { leadName } from './preparationText'
import type { DayEntry } from './types'

const props = defineProps<{
  entry: DayEntry
  /** The trip's first day, `YYYY-MM-DD`: a step due before it stands on M25 alone. */
  tripStart?: string | null
}>()

const preparations = inject(ENTRY_PREPARATIONS, null)
const orchestrator = useOrchestrator()
const today = computed(() => orchestrator.today())

/** The lead a new step is offered with — a week, the owner's „typically". */
const DEFAULT_LEAD = 7

const steps = computed(() => preparations?.steps(props.entry.trip_id, props.entry.id) ?? [])
const openCount = computed(() => steps.value.filter((step) => !step.done).length)
const countLine = computed(() => {
  if (steps.value.length === 0) return null
  return openCount.value > 0
    ? t('ideas.prep.openCount', { n: openCount.value })
    : t('ideas.prep.allDone')
})

function dueOf(leadDays: number): string | null {
  return entryStepDue(leadDays, { onDate: props.entry.on_date })
}

/** The step the sheet is open on: null while it is closed, `'new'` for one being written. */
const editing = ref<EntryPreparation | 'new' | null>(null)
const title = ref('')
const lead = ref<number>(DEFAULT_LEAD)

function openNew() {
  title.value = ''
  lead.value = DEFAULT_LEAD
  editing.value = 'new'
}

function openStep(step: EntryPreparation) {
  title.value = step.title
  lead.value = step.leadDays
  editing.value = step
}

/** What the chosen lead makes due, said under the chips (FR-29.21). */
const leadOut = computed(() => {
  const due = dueOf(lead.value)
  if (due === null) return ''
  if (due < today.value) return t('ideas.prep.tooLate')
  const out = t('dayPlan.prep.dueOn', { day: shortDueDay(due) })
  return !!props.tripStart && due < props.tripStart
    ? `${out} · ${t('dayPlan.prep.beforeTrip')}`
    : out
})

function save() {
  const words = title.value.trim()
  if (!preparations || !words || editing.value === null) return
  const { trip_id: tripId, id: entryId } = props.entry
  if (editing.value === 'new') {
    preparations.add(tripId, entryId, words, lead.value, dueOf(lead.value)!)
  } else {
    preparations.edit(tripId, editing.value.id, words, lead.value)
  }
  editing.value = null
}

function remove() {
  if (!preparations || editing.value === null || editing.value === 'new') return
  preparations.remove(props.entry.trip_id, editing.value.id)
  editing.value = null
}

function toggle(step: EntryPreparation) {
  preparations?.toggle(props.entry.trip_id, step.id)
}
</script>

<template>
  <section v-if="preparations" class="prep" data-testid="day-entry-prep">
    <SectionHead :title="t('ideas.prep.title')" :count="countLine" />
    <ListRows v-if="steps.length > 0">
      <ListRow
        v-for="step in steps"
        :key="step.id"
        lines="full"
        :checked="step.done"
        :done="step.done"
        :tick-label="step.title"
        :data-testid="`day-entry-prep-tick-${step.title}`"
        @tick="toggle(step)"
      >
        <IonLabel
          class="words"
          role="button"
          tabindex="0"
          :data-testid="`day-entry-prep-${step.title}`"
          @click="openStep(step)"
          @keydown.enter="openStep(step)"
        >
          {{ step.title }}
        </IonLabel>
        <template #facts>
          <span :data-testid="`day-entry-prep-lead-${step.title}`">{{
            leadName(step.leadDays)
          }}</span>
        </template>
        <template #end>
          <DueBadge
            slot="end"
            :day="step.done ? null : dueOf(step.leadDays)"
            :today="today"
            :testid="`day-entry-prep-due-${step.title}`"
          />
        </template>
      </ListRow>
    </ListRows>
    <button type="button" class="add" data-testid="day-entry-prep-add" @click="openNew">
      <IonIcon :icon="addOutline" aria-hidden="true" />
      {{ t('dayPlan.prep.add') }}
    </button>

    <SheetModal :is-open="editing !== null" testid="day-entry-prep-sheet" @dismiss="editing = null">
      <section v-if="editing !== null" class="sheet">
        <SheetHead
          :title="t('ideas.prep.title')"
          :meta="t('ideas.prep.for', { title: entry.title })"
          close-testid="day-entry-prep-close"
          @close="editing = null"
        />
        <span class="jp-eyebrow">{{ t('ideas.prep.what') }}</span>
        <IonInput
          v-model="title"
          class="what"
          :aria-label="t('ideas.prep.what')"
          :placeholder="t('ideas.prep.placeholder')"
          data-testid="day-entry-prep-title"
          @keydown.enter.prevent="save"
        />
        <span class="jp-eyebrow">{{ t('ideas.prep.when') }}</span>
        <div class="leads" role="group" :aria-label="t('ideas.prep.when')">
          <ChoiceChip
            v-for="one in PREPARATION_LEADS"
            :key="one"
            :pressed="one === lead"
            :data-testid="`day-entry-prep-lead-choice-${one}`"
            @click="lead = one"
          >
            {{ leadName(one) }}
          </ChoiceChip>
        </div>
        <p class="lead-out jp-num" data-testid="day-entry-prep-lead-out">{{ leadOut }}</p>
        <div class="actions">
          <IonButton
            expand="block"
            shape="round"
            :disabled="title.trim() === ''"
            data-testid="day-entry-prep-save"
            @click="save"
          >
            {{ editing === 'new' ? t('ideas.prep.addSave') : t('ideas.prep.save') }}
          </IonButton>
          <IonButton
            v-if="editing !== 'new'"
            fill="clear"
            size="small"
            color="danger"
            data-testid="day-entry-prep-remove"
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
