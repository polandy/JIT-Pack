<script setup lang="ts">
/**
 * M25's one composer (FR-7.14): a task is written at the top of the screen —
 * `ListComposer`, `ChipRow` and `EntrySheet`, the very components M6's
 * composer is built of — the field, then chips that file it as it is typed,
 * so a task is tagged and dated as it is written rather than afterwards
 * through its sheet.
 *
 * Three rows of chips:
 *
 *  - **the phase** — *Vor der Reise* until the trip's first day or the
 *    finished packing (FR-7.12), whichever comes first; then the row goes and
 *    everything written is for the road;
 *  - **the tag** — the task tags, and *＋ Tag*, which opens M6's entry sheet
 *    with the words typed so far, the day and the tag chooser with its
 *    search-or-create, so a tag that is not one yet is made where
 *    it is needed (FR-7.8);
 *  - **the day** — `DueChips`, shown once there is something to date.
 *
 * The phase and the tag stay after a task is written, as M6's tag does: the
 * things for one errand are typed one after another. The day does not — two
 * tasks due the same day is a coincidence, not a series.
 *
 * It writes the trip's own kind only (a preparation is declared on its row,
 * FR-7.3), in one insert with its filing, and reports what it wrote so the
 * screen can arm the undo.
 */
import { computed, ref, watch } from 'vue'

import ChipRow from '@/components/global/ChipRow.vue'
import ChoiceChip from '@/components/global/ChoiceChip.vue'
import DueChips from '@/components/global/DueChips.vue'
import EntrySheet from '@/components/global/EntrySheet.vue'
import ListComposer from '@/components/global/ListComposer.vue'
import TaskTagChooser from '@/components/trips/TaskTagChooser.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { t } from '@/i18n'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING, type TaskPhase, type TaskTag } from '@/types/domain'

const props = defineProps<{
  tripId: string
  /** The tags a task may be filed under, in their own order. */
  taskTags: readonly TaskTag[]
  /** Today as the device reckons it. */
  today: string
  /** The trip's first day, for *Vor Abreise*; null where it names none. */
  tripStart: string | null
  /**
   * A new task is for the road: the packing is finished (FR-7.12) or the
   * trip's first day has come (FR-7.14).
   */
  forTheRoad: boolean
}>()

const emit = defineEmits<{
  /** A task was written — its id, for the undo that takes it out again. */
  added: [id: string, body: string]
}>()

const orchestrator = useOrchestrator()

const composer = ref<{ focus: () => Promise<void> } | null>(null)
const draft = ref('')
const chosenPhase = ref<TaskPhase>(TASK_PHASE_BEFORE)
const phase = computed<TaskPhase>(() => (props.forTheRoad ? TASK_PHASE_DURING : chosenPhase.value))
const tagId = ref<string | null>(null)
const day = ref<string | null>(null)

// A tag deleted elsewhere must not stay chosen with no chip to unchoose it.
watch(
  () => props.taskTags.map((tag) => tag.id),
  (ids) => {
    if (tagId.value !== null && !ids.includes(tagId.value)) tagId.value = null
  },
)

/** The day row waits for something to date, so the composer stays two lines at rest. */
const showDays = computed(() => draft.value.trim() !== '' || day.value !== null)

function toggleTag(id: string) {
  tagId.value = tagId.value === id ? null : id
}

function write(body: string, filing: { taskTagId: string | null; dueDate: string | null }) {
  const id = orchestrator.addTripTodo(
    props.tripId,
    CLIENT_ACTOR_PLACEHOLDER,
    body,
    phase.value,
    filing,
  )
  emit('added', id, body)
}

function add() {
  const body = draft.value.trim()
  if (!body) return
  write(body, { taskTagId: tagId.value, dueDate: day.value })
  draft.value = ''
  day.value = null
}

/**
 * M6's entry sheet, for a task: opened from *＋ Tag*,
 * carrying what was typed, the day and the tag chosen so far. Null while shut.
 */
const entry = ref<{ body: string; tagId: string | null; day: string | null } | null>(null)

function openEntry() {
  entry.value = { body: draft.value, tagId: tagId.value, day: day.value }
}

function chooseEntryTag(id: string | null) {
  if (entry.value) entry.value.tagId = id
}

/** Created where it is needed, like the task sheet's (FR-7.8). */
function createEntryTag(name: string) {
  chooseEntryTag(orchestrator.createTaskTag(name, props.taskTags.length))
}

/** Written as the field would write it; the tag stays for the next task, as M6's does. */
function confirmEntry() {
  const sheet = entry.value
  const body = sheet?.body.trim()
  if (!sheet || !body) return
  write(body, { taskTagId: sheet.tagId, dueDate: sheet.day })
  tagId.value = sheet.tagId
  draft.value = ''
  day.value = null
  entry.value = null
}

/** The FAB's way in: the field, focused (M6's `goToField`). */
async function focus() {
  await composer.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <ListComposer
    ref="composer"
    v-model="draft"
    :placeholder="forTheRoad ? t('tasks.addDuring') : t('tasks.addPlaceholder')"
    :label="t('tasks.addPlaceholder')"
    :add-label="t('common.add')"
    testid="m25-composer"
    input-testid="trip-todo-input"
    submit-testid="trip-todo-add"
    @submit="add"
  >
    <ChipRow v-if="!forTheRoad" :label="t('tasks.phaseLabel')" data-testid="m25-composer-phase">
      <ChoiceChip
        :pressed="phase === TASK_PHASE_BEFORE"
        data-testid="m25-phase-before"
        @click="chosenPhase = TASK_PHASE_BEFORE"
      >
        {{ t('tasks.before') }}
      </ChoiceChip>
      <ChoiceChip
        :pressed="phase === TASK_PHASE_DURING"
        data-testid="m25-phase-during"
        @click="chosenPhase = TASK_PHASE_DURING"
      >
        {{ t('tasks.duringShort') }}
      </ChoiceChip>
    </ChipRow>

    <ChipRow :label="t('tasks.tagLabel')" data-testid="m25-composer-tags">
      <ChoiceChip
        v-for="tag in taskTags"
        :key="tag.id"
        :pressed="tagId === tag.id"
        :data-testid="`m25-composer-tag-${tag.name}`"
        @click="toggleTag(tag.id)"
      >
        {{ tag.name }}
      </ChoiceChip>
      <ChoiceChip add data-testid="m25-composer-tag-new" @click="openEntry">
        {{ t('tasks.tagAdd') }}
      </ChoiceChip>
    </ChipRow>

    <DueChips
      v-if="showDays"
      :value="day"
      :today="today"
      :phase="phase"
      :trip-start="tripStart"
      testid="m25-composer-due"
      @update="day = $event"
    />

    <!-- M6's entry sheet (FR-30.9) — the same component, for a task. -->
    <EntrySheet
      :open="entry !== null"
      :title="t('tasks.entrySheetNew')"
      :name="entry?.body ?? ''"
      :name-label="t('tasks.entryName')"
      :due-label="t('tasks.dueField')"
      :confirm-label="t('common.add')"
      testid="m25-entry-sheet"
      title-testid="m25-entry-title"
      close-testid="m25-entry-close"
      name-testid="m25-entry-name"
      confirm-testid="m25-entry-confirm"
      @close="entry = null"
      @update:name="(name) => entry && (entry.body = name)"
      @confirm="confirmEntry"
    >
      <template #due>
        <DueChips
          v-if="entry"
          :value="entry.day"
          :today="today"
          :phase="phase"
          :trip-start="tripStart"
          testid="m25-entry-due"
          @update="(d) => entry && (entry.day = d)"
        />
      </template>
      <template #tag>
        <TaskTagChooser
          v-if="entry"
          :task-tags="taskTags"
          :chosen="entry.tagId"
          :no-tag-label="t('tasks.noTag')"
          @tag="chooseEntryTag"
          @new-tag="createEntryTag"
        />
      </template>
    </EntrySheet>
  </ListComposer>
</template>
