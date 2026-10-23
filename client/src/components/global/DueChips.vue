<script setup lang="ts">
/**
 * FR-7.14: a due day, chosen from chips — *Heute*, *Morgen*, *Vor Abreise*
 * where it applies, and *Datum…* for the calendar as the last resort, so
 * setting a day is one tap.
 *
 * The day in force is its own chip with a ✕, so taking a date off is one tap
 * too. Used by M25 (composer, task sheet, the selection's *Fällig*) and by
 * M6's composer and entry sheet (FR-30.10) — which is why it is
 * a shared component and works out its chips itself: the shopping module may
 * not reach `domain/` (ADR-066).
 *
 * FR-7.18: given a `time`, a task's sheet also offers the time its reminder
 * arrives — a dashed *Uhrzeit…* chip once a day stands, opening the app's
 * clock in the row, then the time as its own chip with a ✕. Without the
 * prop (M6, the composer, a selection) there is no such chip.
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import DateField from '@/components/global/DateField.vue'
import TimeField from '@/components/global/TimeField.vue'
import {
  QUICK_DAY_BEFORE_DEPARTURE,
  QUICK_DAY_TODAY,
  QUICK_DAY_TOMORROW,
  quickDueDays,
  type QuickDayKey,
} from '@/domain/taskQuickDays'
import { t, type MessageKey } from '@/i18n'
import { isClockTime } from '@/lib/clockTime'
import { dueLabel, shortDueDay } from '@/lib/taskDueText'
import type { TaskPhase } from '@/types/domain'

const props = defineProps<{
  /** The day in force, `YYYY-MM-DD`, or null for none. */
  value: string | null
  /** Today as the device reckons it. */
  today: string
  /**
   * What the day is for — *Vor Abreise* is offered only for before the trip;
   * null where the things in hand are of both phases (a mixed selection).
   */
  phase: TaskPhase | null
  /** The trip's first day; null where it names none. */
  tripStart: string | null
  /**
   * The test handle: the *Datum…* chip carries it and the calendar
   * `${testid}-picker`, so `setDateField` drives it as it drives a field.
   */
  testid: string
  /**
   * FR-7.18: the time in force, `HH:MM`, or null for none; absent where a
   * time is not offered at all.
   */
  time?: string | null
}>()

const emit = defineEmits<{
  update: [day: string | null]
  /** FR-7.18: a time set, or null for one taken off. */
  time: [time: string | null]
}>()

/** Whether the clock is open in the row, in place of the *Uhrzeit…* chip. */
const editingTime = ref(false)
const typedTime = ref('')

function openTime() {
  typedTime.value = ''
  editingTime.value = true
}

/** A settled time is the answer; empty or past the clock closes the field unanswered. */
function onTimeSettled(value: string) {
  editingTime.value = false
  if (isClockTime(value) && value !== props.time) emit('time', value)
}

const QUICK_LABEL: Record<QuickDayKey, MessageKey> = {
  [QUICK_DAY_TODAY]: 'tasks.dueToday',
  [QUICK_DAY_TOMORROW]: 'tasks.dueTomorrow',
  [QUICK_DAY_BEFORE_DEPARTURE]: 'tasks.quickBeforeDeparture',
}

const quick = computed(() =>
  quickDueDays(props.today, { phase: props.phase, tripStart: props.tripStart }),
)

const picker = ref<{ openPicker: () => void } | null>(null)

/** The chip for the day in force: its short date, and its state where it has one. */
const current = computed(() => {
  if (!props.value) return null
  const label = dueLabel(props.value, props.today)
  const day = shortDueDay(props.value)
  return label && label.text !== day ? `${day} · ${label.text}` : day
})

function choose(day: string) {
  emit('update', day === props.value ? null : day)
}

function onPicked(iso: string) {
  const next = iso === '' ? null : iso
  if (next !== props.value) emit('update', next)
}
</script>

<template>
  <div class="due-chips" :data-testid="`${testid}-chips`">
    <ChoiceChip
      v-if="current"
      pressed
      :label="t('tasks.dueClear', { day: current })"
      :data-testid="`${testid}-current`"
      @click="emit('update', null)"
    >
      {{ current }}
      <IonIcon :icon="closeOutline" aria-hidden="true" />
    </ChoiceChip>
    <ChoiceChip
      v-for="chip in quick"
      v-show="chip.day !== value"
      :key="chip.key"
      :data-testid="`due-chip-${chip.key}`"
      @click="choose(chip.day)"
    >
      {{ t(QUICK_LABEL[chip.key]) }}
    </ChoiceChip>
    <ChoiceChip add :data-testid="testid" @click="picker?.openPicker()">
      {{ t('tasks.quickPick') }}
    </ChoiceChip>
    <template v-if="time !== undefined && value">
      <TimeField
        v-if="editingTime"
        v-model="typedTime"
        autofocus
        class="time-field"
        :aria-label="t('tasks.dueTimeField')"
        :data-testid="`${testid}-time-field`"
        @settle="onTimeSettled"
      />
      <ChoiceChip
        v-else-if="time"
        pressed
        :label="t('tasks.dueTimeClear', { time })"
        :data-testid="`${testid}-time`"
        @click="emit('time', null)"
      >
        {{ time }}
        <IonIcon :icon="closeOutline" aria-hidden="true" />
      </ChoiceChip>
      <ChoiceChip v-else add :data-testid="`${testid}-time`" @click="openTime">
        {{ t('tasks.dueTimeAdd') }}
      </ChoiceChip>
    </template>
    <DateField
      ref="picker"
      bare
      :label="t('tasks.dueField')"
      :value="value ?? ''"
      :testid="testid"
      @update="onPicked"
    />
  </div>
</template>

<style scoped>
.due-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

/* As wide as a chip holding `HH:MM`, so the row does not reflow as it opens. */
.time-field {
  flex: none;
  width: 5.5em;
  --padding-start: 8px;
  --padding-end: 8px;
  min-height: 0;
  border: 1px solid var(--jp-action);
  border-radius: var(--jp-r-pill);
  font-size: var(--jp-text-sm);
}
</style>
