<script setup lang="ts">
/**
 * One phase of M25 (FR-7.7): its head, its tag groups (FR-7.8) and, since
 * FR-7.14, **one** *erledigt* fold at its end — the finished tasks used to
 * fold under every tag group, and a *1 erledigt* between two headings read as
 * a heading of its own.
 *
 * A component because the page draws a phase in two places: in reading
 * order, and — for *before*, once the packing is finished — inside the fold
 * at the end of the screen (FR-7.14's history, which comes after the trip's
 * live work rather than above it).
 *
 * The acts are reported, never written: the page owns the snackbar and the
 * drag.
 */
import { IonList } from '@ionic/vue'
import { computed } from 'vue'

import InlineHint from '@/components/global/InlineHint.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import ListGroup from '@/components/global/ListGroup.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import TripTodoList from '@/components/trips/TripTodoList.vue'
import type { RowSelection } from '@/composables/useRowSelection'
import type { PhaseShelf } from '@/domain/taskBoard'
import { TASK_ORIGIN_PREP, type TaskGroup, type TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { TASK_PHASE_BEFORE, type TaskPhase } from '@/types/domain'

/** The size a group's heading wears its tag's mark at (G-15's scale). */
const MARK_SIZE = 15

const props = withDefaults(
  defineProps<{
    tripId: string
    phase: TaskPhase
    /** The phase's tasks as the board split them (`taskBoard`). */
    shelf: PhaseShelf
    /** Its open tasks under their headings (`taskGroups`). */
    groups: readonly TaskGroup[]
    /** How many of its open tasks stand in the *Fällig* block instead. */
    dueElsewhere: number
    /** The key a drop on `group` carries — the page reads it back. */
    dropKey: (group: TaskGroup) => string
    /** FR-7.12: a closed phase — no drop, no grip, no tick, no seat. */
    readonly?: boolean
    /** The head is the page's, where the phase is drawn inside a fold. */
    headless?: boolean
    testid?: string
    assignable?: boolean
    nameOf?: (userId: string | null) => string | null
    lift?: (ev: PointerEvent, task: TripTask, row: HTMLElement) => void
    selection?: RowSelection
    today: string
    /** A task's tag name, for the fold's rows (they stand outside their group). */
    tagOf?: (task: TripTask) => string | null
  }>(),
  {
    readonly: false,
    headless: false,
    testid: undefined,
    assignable: false,
    nameOf: undefined,
    lift: undefined,
    selection: undefined,
    tagOf: undefined,
  },
)

const emit = defineEmits<{
  toggle: [task: TripTask]
  assign: [task: TripTask]
  open: [task: TripTask]
}>()

/**
 * What the head counts: what stands under it. A task in the *Fällig* block
 * is read up there, and a head that counted it too would disagree with the
 * list it heads.
 */
const count = computed(() => {
  const open = props.shelf.open.length
  return open > 0 ? t('tripTodos.open', { n: open }) : null
})

/**
 * Said only when the phase has no open task anywhere: an empty section whose
 * tasks are all in the *Fällig* block is not „nothing left to do".
 */
const empty = computed(() => props.shelf.open.length === 0 && props.dueElsewhere === 0)

/** A group's heading: its tag's name, or what the untagged group is called. */
function groupName(group: TaskGroup): string {
  if (group.tag) return group.tag.name
  return t(group.origin === TASK_ORIGIN_PREP ? 'tasks.fromPacking' : 'tasks.noTag')
}
</script>

<template>
  <section
    class="phase"
    :data-testid="testid ?? (phase === TASK_PHASE_BEFORE ? 'm25-before' : 'm25-during')"
  >
    <SectionHead
      v-if="!headless"
      :title="t(phase === TASK_PHASE_BEFORE ? 'tasks.before' : 'tasks.during')"
      :count="count"
    />
    <InlineHint v-if="empty && !readonly" class="hint-wide">{{
      t(phase === TASK_PHASE_BEFORE ? 'tasks.emptyBefore' : 'tasks.emptyDuring')
    }}</InlineHint>
    <IonList v-if="groups.length > 0" class="groups">
      <ListGroup
        v-for="group in groups"
        :key="group.key"
        :title="groupName(group)"
        :drop-target="dropKey(group)"
        :droppable="!readonly"
        :data-testid="`m25-group-${group.key}`"
      >
        <template v-if="group.tag?.icon" #mark>
          <ItemMark :mark="group.tag.icon" surface="plain" :size="MARK_SIZE" />
        </template>
        <TripTodoList
          :trip-id="tripId"
          :tasks="group.tasks"
          :assignable="assignable"
          :name-of="nameOf"
          :lift="readonly ? undefined : lift"
          :selection="readonly ? undefined : selection"
          :readonly="readonly"
          :today="today"
          variant="list"
          @toggle="emit('toggle', $event)"
          @assign="emit('assign', $event)"
          @open="emit('open', $event)"
        />
      </ListGroup>
    </IonList>
    <!-- FR-7.14: one fold per phase, at its end. -->
    <TripTodoList
      v-if="shelf.resolved.length > 0"
      class="done-fold"
      :trip-id="tripId"
      :tasks="shelf.resolved"
      :name-of="nameOf"
      :readonly="readonly"
      :tag-of="tagOf"
      variant="list"
      data-testid="m25-done"
      @toggle="emit('toggle', $event)"
      @open="emit('open', $event)"
    />
  </section>
</template>

<style scoped>
.phase :deep(.section-head) {
  margin: 18px 16px 4px;
}

/* The hint sits at the group's own inset, wider than InlineHint's default. */
.hint-wide {
  margin: 4px 18px 8px;
}

/* The groups sit in one list per phase, full width like M6's (2026-09-24). */
.groups {
  padding: 0;
  background: transparent;
}

.done-fold {
  margin-top: 4px;
}
</style>
