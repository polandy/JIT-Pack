/**
 * M5's preparation list (FR-7.3) and notes thread (FR-7.1/7.2) for one row,
 * including the G-4 deep link that scrolls to and flashes a comment reached
 * from a notification.
 *
 * A composable of its own because both sections are one self-contained
 * slice of `ItemDetailSheet.vue`'s state: they read the row's own id and lock
 * state and write through `orchestrator.comments`, but neither touches the
 * packing, assignment or edit controls around them.
 */
import { type ComputedRef, type Ref, computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { COMMENT_QUERY_PARAM } from '@/router/paths'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { ItemComment, PrepTask, TripItem } from '@/types/domain'
import { STATE_PACKED, TASK_STATE_OPEN } from '@/types/domain'

/** useItemDiscussion binds one row's preparation tasks and notes to the sheet. */
export function useItemDiscussion(
  tripId: () => string,
  itemId: () => string,
  item: ComputedRef<TripItem | null | undefined>,
  isLocked: Ref<boolean> | ComputedRef<boolean>,
) {
  const orchestrator = useOrchestrator()
  const tripStore = useTripStore()

  // --- Preparation (FR-7.3) ---
  const prepTasks = computed(() => tripStore.getRowPrepTasks(tripId(), itemId()))
  const openPrepCount = computed(
    () => prepTasks.value.filter((t) => t.task_state === TASK_STATE_OPEN).length,
  )
  const hasPrepWithPacked = computed(
    () => item.value?.state === STATE_PACKED && openPrepCount.value > 0,
  )
  const newPrepTaskText = ref('')

  function addPrepTask() {
    const body = newPrepTaskText.value.trim()
    if (!body || isLocked.value) return
    orchestrator.comments.addPrepTask(tripId(), itemId(), CLIENT_ACTOR_PLACEHOLDER, body)
    newPrepTaskText.value = ''
  }

  function togglePrepTask(task: PrepTask) {
    if (isLocked.value) return
    if (task.task_state === TASK_STATE_OPEN) orchestrator.comments.resolvePrepTask(task)
    else orchestrator.comments.reopenPrepTask(task)
  }

  // --- Notes (FR-7.1/7.2) ---
  const itemComments = computed(() => tripStore.getItemComments(tripId(), itemId()))
  const newCommentText = ref('')

  // G-4: a notification deep link (?comment=) scrolls to the referenced
  // message and flashes it. The thread may still be syncing when we arrive,
  // so this watches the list and fires once the target appears.
  const route = useRoute()
  const flashedCommentId = ref<string | null>(null)
  /**
   * The same id, kept after the animation has ended.
   *
   * The flash is a 2.4 s window, so it is not something a test can assert
   * without racing it — and the arrival it reports is exactly what G-4
   * promises. This records the outcome instead: set once the referenced
   * comment has been found and scrolled to, never cleared (E2E-G4-01).
   */
  const deepLinkedCommentId = ref<string | null>(null)
  watch(
    itemComments,
    (comments) => {
      const target = route.query[COMMENT_QUERY_PARAM]
      if (typeof target !== 'string' || flashedCommentId.value === target) return
      if (!comments.some((c) => c.id === target)) return
      flashedCommentId.value = target
      deepLinkedCommentId.value = target
      requestAnimationFrame(() => {
        document
          .getElementById(`comment-${target}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      setTimeout(() => {
        if (flashedCommentId.value === target) flashedCommentId.value = null
      }, 2400)
    },
    { immediate: true },
  )

  function addComment() {
    const body = newCommentText.value.trim()
    if (!body) return
    orchestrator.comments.addComment(tripId(), itemId(), CLIENT_ACTOR_PLACEHOLDER, body)
    newCommentText.value = ''
  }

  /** FR-7.2: promoting a note moves it into the Preparation section above. */
  function flagAsTask(comment: ItemComment) {
    orchestrator.comments.flagCommentAsTask(tripId(), comment)
  }

  return {
    prepTasks,
    openPrepCount,
    hasPrepWithPacked,
    newPrepTaskText,
    addPrepTask,
    togglePrepTask,
    itemComments,
    newCommentText,
    flashedCommentId,
    deepLinkedCommentId,
    addComment,
    flagAsTask,
  }
}
