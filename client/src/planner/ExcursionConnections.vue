<script setup lang="ts">
/**
 * The connections of one excursion, on its own screen (FR-29.18): one quiet
 * line per connection — the way there or back — and the line that adds one.
 * Adding and changing use the day plan's sheet, which says which excursion the
 * connection is for; the day plan shows the result on its day. M27 renders this
 * through `lib/excursionConnections.ts`, so the packing side never imports it.
 */
import { IonIcon } from '@ionic/vue'
import { addOutline, chevronForward, trainOutline } from 'ionicons/icons'
import { computed, onMounted, ref } from 'vue'

import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { t } from '@/i18n'
import { confirmDestructive } from '@/lib/confirm'
import type { ExcursionConnectionsProps } from '@/lib/excursionConnections'
import { shortDueDay } from '@/lib/taskDueText'
import { DAY_ENTRY_CONNECTION, type DayEntry } from '@/types/domain'
import { createPlannerActions, type ConnectionFields } from './actions'
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

function wording(entry: DayEntry): string {
  return [shortDueDay(entry.on_date), entry.at_time].filter((part) => !!part).join(' · ')
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
    <button
      v-for="entry in connections"
      :key="entry.id"
      type="button"
      class="line"
      :data-testid="`m27-connection-${entry.id}`"
      @click="editing = entry"
    >
      <IonIcon class="glyph" :icon="trainOutline" aria-hidden="true" />
      <span class="name">{{ entry.title }}</span>
      <span class="when jp-num">{{ wording(entry) }}</span>
      <IonIcon class="chevron" :icon="chevronForward" aria-hidden="true" />
    </button>
    <button type="button" class="line add" data-testid="m27-add-connection" @click="editing = null">
      <IonIcon class="glyph" :icon="addOutline" aria-hidden="true" />
      <span class="name">{{ t('dayPlan.addConnection') }}</span>
    </button>

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
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 12px 8px;
}

.line {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 4px;
  border: none;
  background: none;
  color: var(--ct-subtext1);
  font: inherit;
  font-size: var(--jp-text-sm);
  text-align: start;
  cursor: pointer;
}

.line:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
  border-radius: var(--jp-r-sm);
}

.glyph {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-sm);
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.when {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.chevron {
  flex: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-xs);
}
</style>
