<script setup lang="ts">
/**
 * FR-7.14: a due day, chosen from chips — *Heute*, *Morgen*, *Vor Abreise*
 * where it applies, and *Datum…* for the calendar as the last resort. The
 * owner's rework of 2026-09-25: a day used to take five taps through two
 * stacked sheets.
 *
 * The day in force is its own chip with a ✕, so taking a date off is one tap
 * too. Used by M25 (composer, task sheet, the selection's *Fällig*) and, since
 * 2026-09-26, by M6's composer and entry sheet (FR-30.10) — which is why it is
 * a shared component and works out its chips itself: the shopping module may
 * not reach `domain/` (ADR-066).
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import DateField from '@/components/global/DateField.vue'
import {
  QUICK_DAY_BEFORE_DEPARTURE,
  QUICK_DAY_TODAY,
  QUICK_DAY_TOMORROW,
  quickDueDays,
  type QuickDayKey,
} from '@/domain/taskQuickDays'
import { t, type MessageKey } from '@/i18n'
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
}>()

const emit = defineEmits<{ update: [day: string | null] }>()

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
  gap: 6px;
}
</style>
