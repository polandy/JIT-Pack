/**
 * FR-7.11's reminder where there is no server to send it: Local Mode tells
 * the person once, when the app is opened, how many tasks — and, since
 * FR-30.10, purchases — are due: the in-app stand-in for the push a server
 * would have sent at six.
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
import type { DuePurchaseCount } from '@/lib/tripCards'
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
  /** FR-30.10: the trip's purchases due by tomorrow — the shopping module's count. */
  purchasesDue?: DuePurchaseCount
  today: () => string
}): void {
  if (!opts.local) return
  watch(
    () => {
      const ids = opts.tripIds.value
      if (ids.length === 0 || !ids.every(opts.loaded)) return null
      const today = opts.today()
      return {
        tasks: ids.reduce((n, id) => n + dueByTomorrowCount(opts.tasksOf(id), today), 0),
        purchases: ids.reduce((n, id) => n + (opts.purchasesDue?.(id, today) ?? 0), 0),
      }
    },
    (due) => {
      if (said || due === null) return
      said = true
      const message = dueHintText(due.tasks, due.purchases)
      if (message !== null) void presentToast({ message })
    },
    { immediate: true },
  )
}

/** The hint's sentence, naming only what there is; null when nothing is due. */
export function dueHintText(tasks: number, purchases: number): string | null {
  if (tasks > 0 && purchases > 0) {
    return t('tasks.dueHintBoth', {
      tasks: t('tasks.dueCount', { n: tasks }),
      purchases: t('shopping.dueCount', { n: purchases }),
    })
  }
  if (tasks > 0) return t('tasks.dueHint', { n: tasks })
  if (purchases > 0) return t('shopping.dueHint', { n: purchases })
  return null
}
