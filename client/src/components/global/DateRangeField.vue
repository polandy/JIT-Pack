<script setup lang="ts">
/**
 * The app's range control (G-17, ADR-080): one field for a first and a last
 * day, and a sheet whose calendar lists months one under the other, so a range
 * across a month's end is seen whole. The first tap sets the start, the next
 * the end; the two sides in the sheet's head choose which one the next tap
 * sets, so one side can be moved alone. The rules are `lib/dateRange.ts`.
 *
 * The bounds are what the picker offers, never a validation: a day outside
 * them cannot be tapped, and a stored range that already lies outside still
 * renders and can be repaired.
 */
import { computed, nextTick, ref } from 'vue'

import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { durationDays } from '@/domain/instantiate'
import { formatDay, formatDayRange, intlLocale, t } from '@/i18n'
import {
  calendarMonths,
  dayRole,
  DEFAULT_REACH,
  MONTHS_MORE,
  monthDays,
  monthKey,
  outOfBounds,
  tapDay,
  type CalendarReach,
  type RangePick,
  type RangeSide,
} from '@/lib/dateRange'

const props = withDefaults(
  defineProps<{
    label: string
    start: string
    end: string
    testid: string
    /** The names of the two sides in the sheet's head. */
    startLabel: string
    endLabel: string
    readonly?: boolean
    /** ISO days the calendar offers between; empty is no bound. */
    min?: string
    max?: string
  }>(),
  { readonly: false, min: '', max: '' },
)

const emit = defineEmits<{ update: [start: string, end: string] }>()

const orchestrator = useOrchestrator()

const open = ref(false)
const pick = ref<RangePick>({ range: { start: '', end: '' }, side: 'start' })
const draft = computed(() => pick.value.range)
const scroller = ref<HTMLElement | null>(null)
const today = ref('')
const reach = ref<CalendarReach>(DEFAULT_REACH)

const display = computed(() => {
  const { start, end } = props
  if (start && end) return formatDayRange(start, end)
  return start || end ? formatDay(start || end) : ''
})

const days = computed(() => durationDays(props.start || null, props.end || null))

/*
 * Anchored where the sheet opened, not on the draft: a tap must not move the
 * months under the finger.
 */
const anchor = ref('')

const months = computed(() => calendarMonths(anchor.value, props.min, props.max, reach.value))

const draftDays = computed(() => durationDays(draft.value.start || null, draft.value.end || null))

const monthTitle = new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric' })
const dayName = new Intl.DateTimeFormat(intlLocale(), {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Monday to Sunday, in the app's locale: 2024-01-01 was a Monday. */
const weekdays = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(intlLocale(), { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, 1 + i)),
  ),
)

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function openSheet() {
  if (props.readonly) return
  today.value = orchestrator.today()
  pick.value = { range: { start: props.start, end: props.end }, side: 'start' }
  anchor.value = props.start || props.end || today.value
  reach.value = DEFAULT_REACH
  open.value = true
}

/** Brings the range's month, else today's, to the top once the sheet has landed. */
async function onPresent() {
  await nextTick()
  const box = scroller.value
  if (!box) return
  const target = (draft.value.start || draft.value.end || today.value).slice(0, 7)
  const month = box.querySelector<HTMLElement>(`[data-month="${target}"]`)
  if (month) box.scrollTop = month.offsetTop
}

/** Adds months above the list, keeping the ones on screen where they are. */
async function showEarlier() {
  const box = scroller.value
  const fromBottom = box ? box.scrollHeight - box.scrollTop : 0
  reach.value = { ...reach.value, before: reach.value.before + MONTHS_MORE }
  await nextTick()
  if (box) box.scrollTop = box.scrollHeight - fromBottom
}

function showLater() {
  reach.value = { ...reach.value, after: reach.value.after + MONTHS_MORE }
}

function tap(day: string) {
  pick.value = tapDay(pick.value, day)
}

function chooseSide(side: RangeSide) {
  pick.value = { ...pick.value, side }
}

function apply() {
  emit('update', draft.value.start, draft.value.end)
  open.value = false
}

function clear() {
  pick.value = { range: { start: '', end: '' }, side: 'start' }
}
</script>

<template>
  <button
    type="button"
    class="range-field"
    :class="{ locked: readonly }"
    :aria-disabled="readonly || undefined"
    :data-testid="testid"
    @click="openSheet"
  >
    <span class="text">
      <span class="label">{{ label }}</span>
      <span v-if="display" class="value jp-num" :data-testid="`${testid}-value`">{{
        display
      }}</span>
      <span v-else class="value empty">{{ t('dateRange.placeholder') }}</span>
    </span>
    <span v-if="days !== null" class="pill jp-num" :data-testid="`${testid}-days`">
      {{ t('dateRange.days', { n: days }) }}
    </span>
  </button>

  <SheetModal :is-open="open" @dismiss="open = false" @present="onPresent">
    <div class="sheet" :data-testid="`${testid}-picker`">
      <SheetHead :title="label" @close="open = false" />

      <div class="sides">
        <button
          type="button"
          class="side"
          :class="{ active: pick.side === 'start' }"
          :aria-pressed="pick.side === 'start'"
          :data-testid="`${testid}-start`"
          @click="chooseSide('start')"
        >
          <span class="jp-eyebrow">{{ startLabel }}</span>
          <span class="side-value jp-num">{{ draft.start ? formatDay(draft.start) : '—' }}</span>
        </button>
        <span class="arrow" aria-hidden="true">→</span>
        <button
          type="button"
          class="side"
          :class="{ active: pick.side === 'end' }"
          :aria-pressed="pick.side === 'end'"
          :data-testid="`${testid}-end`"
          @click="chooseSide('end')"
        >
          <span class="jp-eyebrow">{{ endLabel }}</span>
          <span class="side-value jp-num">{{ draft.end ? formatDay(draft.end) : '—' }}</span>
        </button>
      </div>

      <div class="weekdays jp-eyebrow" aria-hidden="true">
        <span v-for="name in weekdays" :key="name">{{ name }}</span>
      </div>

      <div ref="scroller" class="months">
        <button
          v-if="!min"
          type="button"
          class="more"
          :data-testid="`${testid}-earlier`"
          @click="showEarlier"
        >
          {{ t('dateRange.earlier') }}
        </button>
        <section
          v-for="month in months"
          :key="monthKey(month)"
          class="month"
          :data-month="monthKey(month)"
        >
          <h3 class="month-title">
            {{ monthTitle.format(new Date(month.year, month.month - 1, 1)) }}
          </h3>
          <div class="grid">
            <span v-for="n in monthDays(month).lead" :key="`lead-${n}`" />
            <button
              v-for="day in monthDays(month).days"
              :key="day"
              type="button"
              class="day jp-num"
              :class="[dayRole(draft, day), { today: day === today }]"
              :data-day="day"
              :disabled="outOfBounds(day, min, max)"
              :aria-label="dayName.format(utc(day))"
              :aria-pressed="dayRole(draft, day) !== null"
              @click="tap(day)"
            >
              <span class="n">{{ Number(day.slice(8)) }}</span>
            </button>
          </div>
        </section>
        <button
          v-if="!max"
          type="button"
          class="more"
          :data-testid="`${testid}-later`"
          @click="showLater"
        >
          {{ t('dateRange.later') }}
        </button>
      </div>

      <footer class="foot">
        <button type="button" class="clear" :data-testid="`${testid}-clear`" @click="clear">
          {{ t('dateField.clear') }}
        </button>
        <span class="hint jp-meta" :data-testid="`${testid}-hint`">
          <template v-if="draftDays !== null">{{ t('dateRange.days', { n: draftDays }) }}</template>
          <template v-else-if="pick.side === 'start'">{{ t('dateRange.pickStart') }}</template>
          <template v-else>{{ t('dateRange.pickEnd') }}</template>
        </span>
        <button
          type="button"
          class="apply"
          :data-testid="`${testid}-apply`"
          :disabled="!draft.start && !draft.end && !props.start && !props.end"
          @click="apply"
        >
          {{ t('common.done') }}
        </button>
      </footer>
    </div>
  </SheetModal>
</template>

<style scoped>
.range-field {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 0;
  background: transparent;
  color: var(--ct-text);
  text-align: start;
  font: inherit;
  cursor: pointer;
}

.range-field.locked {
  cursor: default;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.label {
  font-size: var(--jp-text-sm);
  color: var(--ct-text);
}

.value {
  font-size: var(--jp-text-md);
}

.value.empty {
  color: var(--ct-overlay1);
}

.pill {
  flex: none;
  padding: 2px 8px;
  border-radius: var(--jp-r-pill);
  font-size: var(--jp-text-xs);
  color: var(--jp-brand);
  background: color-mix(in srgb, var(--jp-brand) 18%, transparent);
}

.sheet {
  display: flex;
  flex-direction: column;
  padding: 0 16px 16px;
}

.sides {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.side {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  box-shadow: 0 0 0 1.5px transparent;
}

.side.active {
  box-shadow: 0 0 0 1.5px var(--jp-brand);
}

.side-value {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}

.arrow {
  color: var(--ct-overlay1);
}

.weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-top: 12px;
  padding-bottom: 6px;
  text-align: center;
  border-bottom: 1px solid var(--ct-surface0);
}

.months {
  position: relative;
  max-height: 52vh;
  overflow-y: auto;
}

.month-title {
  margin: 0;
  padding: 16px 6px 8px;
  font-family: var(--jp-font-display);
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-medium);
}

.more {
  display: block;
  width: 100%;
  padding: 12px;
  background: transparent;
  color: var(--jp-action);
  font: inherit;
  font-weight: var(--jp-weight-semibold);
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  row-gap: 4px;
}

.day {
  position: relative;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
  cursor: pointer;
  touch-action: manipulation;
}

.day:disabled {
  color: var(--ct-surface2);
  cursor: not-allowed;
}

.n {
  position: relative;
  z-index: 1;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.day.today .n {
  box-shadow: 0 0 0 1.5px var(--ct-surface2);
}

.day.inside::before,
.day.start::before,
.day.end::before {
  content: '';
  position: absolute;
  inset: 2px 0;
  background: color-mix(in srgb, var(--jp-brand) 22%, transparent);
}

.day.start::before {
  left: 50%;
}

.day.end::before {
  right: 50%;
}

.day.start .n,
.day.end .n,
.day.single .n {
  background: var(--jp-brand);
  color: var(--jp-brand-contrast);
  font-weight: var(--jp-weight-bold);
}

.foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--ct-surface0);
}

.hint {
  flex: 1;
  text-align: center;
}

.clear,
.apply {
  padding: 10px 16px;
  border-radius: var(--jp-r-md);
  font: inherit;
  font-weight: var(--jp-weight-semibold);
}

.clear {
  background: transparent;
  color: var(--ct-subtext1);
}

.apply {
  background: var(--jp-brand);
  color: var(--jp-brand-contrast);
}

.apply:disabled {
  background: var(--ct-surface0);
  color: var(--ct-overlay1);
}
</style>
