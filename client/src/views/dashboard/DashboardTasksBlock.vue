<script setup lang="ts">
/**
 * A trip's open tasks in the hero, worked in place (FR-7.10, ADR-074).
 *
 * The one place M1 stops only reporting on tasks: once the packing is
 * finished what is owed is the tasks and the shopping, and the dashboard is
 * where they are looked at. Every write goes through `useTaskActs`, the same
 * acts M4 and M25 use, so which of the two kinds of task is being written, what
 * the undo puts back and what the snackbar says are answered once.
 */
import { computed, ref } from 'vue'

import DashboardBlock from '@/components/global/DashboardBlock.vue'
import DashboardBlockRow from '@/components/global/DashboardBlockRow.vue'
import DueBadge from '@/components/global/DueBadge.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { usePackAnnouncer } from '@/composables/usePackAnnouncer'
import { useTaskActs } from '@/composables/useTaskActs'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripTasks } from '@/composables/useTripTasks'
import { openDueDay } from '@/domain/taskDue'
import { dashboardTasks, type TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { tripSubPath } from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import { TASK_PHASE_BEFORE, type TaskPhase } from '@/types/domain'

const props = defineProps<{
  tripId: string
  /** The phase of task to lead with — where the trip is (`taskPhaseInFront`). */
  phaseInFront: TaskPhase
  testid: string
}>()

/** The block's remembered fold (`lib/blockFold.ts`). */
const TASKS_FOLD_KEY = 'tasks'

/** How many tasks the block lists before it hands over to M25. */
const MAX_TASKS = 4

const orchestrator = useOrchestrator()
const masterStore = useMasterStore()
const { tasksOf } = useTripTasks()
const { myUserId, nameOf } = useTripIdentity(props.tripId, orchestrator)
const { rowUndo, announceAct, announceTaskDone } = usePackAnnouncer(null)

const acts = useTaskActs(() => props.tripId, {
  rowUndo,
  announceAct,
  announceTaskDone,
  // The seat is not on this block; the picker is never asked for.
  pickAssignee: () => Promise.resolve(undefined),
  nameOf,
  removing: ref(new Set<string>()),
})

const picked = computed(() =>
  dashboardTasks(tasksOf(props.tripId), {
    phaseInFront: props.phaseInFront,
    myUserId: myUserId.value,
    limit: MAX_TASKS,
    today: orchestrator.today(),
  }),
)

/** ADR-033: „nothing left" is only said once the trip's rows are here. */
const loaded = computed(() => orchestrator.tripDataLoaded(props.tripId))

/** What kind of task it is: its tag, or the row it prepares — then whose job it is. */
function sub(task: TripTask): string | null {
  const kind = task.task_tag_id
    ? (masterStore.taskTagList.find((tag) => tag.id === task.task_tag_id)?.name ?? null)
    : (task.item?.name ?? null)
  const who = nameOf(task.assignee_user_id)
  return [kind, who].filter(Boolean).join(' · ') || null
}

const addLabel = computed(() =>
  t(props.phaseInFront === TASK_PHASE_BEFORE ? 'tasks.addBefore' : 'tasks.addDuring'),
)

const empty = computed(() => {
  if (picked.value.open > 0 || !loaded.value) return null
  return t(props.phaseInFront === TASK_PHASE_BEFORE ? 'tasks.emptyBefore' : 'tasks.emptyDuring')
})

/** Written in the phase in front of the trip, which is what the field's label promised. */
function add(text: string) {
  const id = orchestrator.addTripTodo(
    props.tripId,
    CLIENT_ACTOR_PLACEHOLDER,
    text,
    props.phaseInFront,
  )
  acts.added(id, text, t('dashboard.tasksAdded', { body: text }))
}
</script>

<template>
  <DashboardBlock
    :title="myUserId ? t('dashboard.tasksTitleMine') : t('dashboard.tasksTitle')"
    :count="picked.open"
    :fold-key="TASKS_FOLD_KEY"
    :add-label="addLabel"
    :more-route="tripSubPath(tripId, 'tasks')"
    :more-label="
      picked.rest > 0 ? t('dashboard.tasksMore', { n: picked.rest }) : t('dashboard.tasksAll')
    "
    :empty="empty"
    :testid="testid"
    @add="add"
  >
    <DashboardBlockRow
      v-for="task in picked.rows"
      :key="task.id"
      :title="task.body"
      :sub="sub(task)"
      :check-label="t('dashboard.taskCheck', { body: task.body })"
      :testid="`${testid}-row`"
      @check="acts.toggle(task)"
    >
      <template #lead>
        <DueBadge
          :day="openDueDay(task)"
          :today="orchestrator.today()"
          :testid="`due-${testid}-${task.body}`"
        />
      </template>
    </DashboardBlockRow>
  </DashboardBlock>
</template>
