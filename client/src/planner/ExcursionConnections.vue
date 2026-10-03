<script setup lang="ts">
/**
 * The connections of one excursion, on its own screen (FR-29.18): one quiet
 * line per connection — the way there or back — and the line that adds one.
 * Adding and changing use the day plan's sheet, which says which excursion the
 * connection is for; the day plan shows the result on its day. M27 renders this
 * through `lib/excursionConnections.ts`, so the packing side never imports it.
 */
import { IonIcon } from '@ionic/vue'
import { addOutline, chevronForward } from 'ionicons/icons'
import { computed, onMounted, ref } from 'vue'

import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { t } from '@/i18n'
import { confirmDestructive } from '@/lib/confirm'
import type { ExcursionConnectionsProps } from '@/lib/excursionConnections'
import { shortDueDay } from '@/lib/taskDueText'
import { DAY_ENTRY_CONNECTION, type DayEntry } from '@/types/domain'
import { createPlannerActions, type ConnectionFields } from './actions'
import { timeOf } from './domain/connections'
import DayEntrySheet from './DayEntrySheet.vue'
import { usePageLinks } from './usePageLinks'
import { usePlannerStore } from './store'

const props = defineProps<ExcursionConnectionsProps>()

const orchestrator = useOrchestrator()
const plannerStore = usePlannerStore()
const actions = createPlannerActions(orchestrator.moduleHost, plannerStore)
const pageLinks = usePageLinks(props.tripId, orchestrator)
const { myUserId, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)

onMounted(loadIdentity)

const connections = computed(() =>
  plannerStore
    .getDayEntries(props.tripId)
    .filter((e) => e.kind === DAY_ENTRY_CONNECTION && e.excursion_id === props.excursionId)
    .sort((a, b) =>
      `${a.on_date} ${a.at_time ?? ''}`.localeCompare(`${b.on_date} ${b.at_time ?? ''}`),
    ),
)

/** The connection being changed, or null for a new one; undefined while the sheet is shut. */
const editing = ref<DayEntry | null | undefined>(undefined)

/** Departure and, where the legs know it, arrival — the timetable's two columns. */
function timesOf(entry: DayEntry): { dep: string; arr: string | null } {
  const legs = entry.legs ?? []
  if (legs.length === 0) return { dep: entry.at_time ?? '–', arr: null }
  return { dep: timeOf(legs[0]!.dep), arr: timeOf(legs[legs.length - 1]!.arr) }
}

function onSave(fields: ConnectionFields) {
  const current = editing.value
  editing.value = undefined
  if (current) actions.updateConnection(current, fields)
  else
    actions.addConnection(
      props.tripId,
      { ...fields, excursionId: props.excursionId },
      myUserId.value,
    )
}

async function onRemove() {
  const entry = editing.value
  if (!entry) return
  const confirmed = await confirmDestructive({
    header: t('dayPlan.removeConfirmTitle', { title: entry.title }),
    message: t('dayPlan.removeConfirmBody'),
    confirmLabel: t('dayPlan.remove'),
    testid: 'day-entry-remove-confirm',
  })
  if (!confirmed) return
  editing.value = undefined
  actions.removeDayEntry(entry)
}
</script>

<template>
  <section
    class="connections"
    :aria-label="t('excursionConnections.title')"
    data-testid="m27-connections"
  >
    <h3 class="jp-eyebrow head">{{ t('excursionConnections.title') }}</h3>
    <div class="jp-card card">
      <button
        v-for="entry in connections"
        :key="entry.id"
        type="button"
        class="row"
        :data-testid="`m27-connection-${entry.id}`"
        @click="editing = entry"
      >
        <span class="times jp-num">
          <span class="dep">{{ timesOf(entry).dep }}</span>
          <span v-if="timesOf(entry).arr" class="arr">{{ timesOf(entry).arr }}</span>
        </span>
        <span class="body">
          <span class="name">{{ entry.title }}</span>
          <span class="day">{{ shortDueDay(entry.on_date) }}</span>
        </span>
        <IonIcon class="chevron" :icon="chevronForward" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="row add"
        data-testid="m27-add-connection"
        @click="editing = null"
      >
        <IonIcon class="plus" :icon="addOutline" aria-hidden="true" />
        <span class="name">{{ t('dayPlan.addConnection') }}</span>
      </button>
    </div>

    <DayEntrySheet
      :open="editing !== undefined"
      :entry="editing ?? null"
      :day="day"
      :day-text="day ? shortDueDay(day) : ''"
      :pool="[]"
      :page-links="pageLinks"
      :excursion-title="title"
      connection-only
      @close="editing = undefined"
      @save-connection="onSave"
      @remove="onRemove"
    />
  </section>
</template>

<style scoped>
.connections {
  margin: 12px 12px 8px;
}

.head {
  margin: 0 4px 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 8px 12px;
  border: none;
  border-top: 1px solid var(--jp-surface-border);
  background: none;
  color: var(--ct-text);
  font: inherit;
  font-size: var(--jp-text-md);
  text-align: start;
  cursor: pointer;
}

.row:first-child {
  border-top: none;
}

.row:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}

.times {
  display: flex;
  flex: none;
  flex-direction: column;
  min-width: 44px;
  line-height: var(--jp-leading-tight);
}

.arr {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.chevron {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-xs);
}

.add {
  gap: 8px;
  color: var(--jp-action);
  font-weight: var(--jp-weight-semibold);
}

.plus {
  flex: none;
  font-size: var(--jp-icon-sm);
}
</style>
