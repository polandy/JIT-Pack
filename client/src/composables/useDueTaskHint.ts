/**
 * FR-7.11's reminder where there is no server to send it: Local Mode tells
 * the person once, when the app is opened, how many tasks are due — the
 * in-app stand-in for the push a server would have sent at six (owner,
 * 2026-09-25).
 *
 * Once per app start, not per visit to the dashboard: the hint is the
 * morning's reminder, and repeating it on every return to M1 would make it
 * noise. The count is `dueByTomorrowCount` over every active trip — the same
 * two days the push names, the overdue ones included.
 */
import { watch, type Ref } from 'vue'

import { dueByTomorrowCount } from '@/domain/taskDue'
import { t } from '@/i18n'
import { presentToast } from '@/lib/toast'
import type { TripTask } from '@/domain/tripTodos'

/** Whether this app start has said it already — module state, one per page load. */
let said = false

/** Forgets that the hint was shown, for a spec that mounts twice. */
export function resetDueTaskHint(): void {
  said = false
}

/**
 * useDueTaskHint watches the trips the dashboard shows and says the count
 * once every one of them has its rows on the device (ADR-033: a partition in
 * flight is not an empty list).
 */
export function useDueTaskHint(opts: {
  /** Only Local Mode is told this way; a server sends a push instead. */
  local: boolean
  tripIds: Ref<readonly string[]>
  loaded: (tripId: string) => boolean
  tasksOf: (tripId: string) => TripTask[]
  today: () => string
}): void {
  if (!opts.local) return
  watch(
    () => {
      const ids = opts.tripIds.value
      if (ids.length === 0 || !ids.every(opts.loaded)) return null
      return ids.reduce((n, id) => n + dueByTomorrowCount(opts.tasksOf(id), opts.today()), 0)
    },
    (due) => {
      if (said || due === null) return
      said = true
      if (due > 0) void presentToast({ message: t('tasks.dueHint', { n: due }) })
    },
    { immediate: true },
  )
}
