/**
 * M1's due line (FR-7.11, FR-30.10): what is due by tomorrow across the
 * active trips — tasks and purchases, the overdue ones named — said in the
 * page head's second line for as long as it is true. Each count leads to its
 * block, so the line is the way to what it names as well as the news of it.
 *
 * A standing line rather than a toast, in every mode: a toast is the app's
 * answer to something just done (FR-25.2), and this is the state of the trip
 * — the rows below wear the same *Heute* and *Überfällig*. The window is the
 * two days the server's morning push names (ADR-076).
 */
import { computed, type ComputedRef, type Ref } from 'vue'

import type { HeadMetaPart } from '@/composables/shared/useHeaderTitle'
import { taskDueTally } from '@/domain/taskDue'
import type { TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { addTallies, NO_DUE, type DueTally } from '@/domain/dueDay'
import {
  DUE_BLOCK_SHOPPING,
  DUE_BLOCK_TASKS,
  type DueBlock,
  type DuePurchases,
} from '@/kernel/tripCards'

/** One kind of thing the line counts, and what is due of it on each trip. */
interface Kind {
  block: DueBlock
  countKey: MessageKey
  perTrip: { tripId: string; tally: DueTally }[]
}

/**
 * useDueLine answers the due line's runs, or null when nothing is due by
 * tomorrow or a trip's rows are still on their way (ADR-033: a partition in
 * flight is not an empty list) — the head then keeps its own second line.
 */
export function useDueLine(opts: {
  tripIds: Ref<readonly string[]>
  loaded: (tripId: string) => boolean
  tasksOf: (tripId: string) => TripTask[]
  /** FR-30.10: the shopping module's tally; absent in a build without it. */
  purchases?: DuePurchases
  today: () => string
  /** Bring the trip's block forward — or open its screen where M1 shows no block. */
  go: (block: DueBlock, tripId: string) => void
}): ComputedRef<HeadMetaPart[] | null> {
  return computed(() => {
    const ids = opts.tripIds.value
    if (ids.length === 0 || !ids.every(opts.loaded)) return null
    const today = opts.today()
    const kinds: Kind[] = [
      {
        block: DUE_BLOCK_TASKS,
        countKey: 'tasks.dueCount',
        perTrip: ids.map((tripId) => ({
          tripId,
          tally: taskDueTally(opts.tasksOf(tripId), today),
        })),
      },
      {
        block: DUE_BLOCK_SHOPPING,
        countKey: 'shopping.dueCount',
        perTrip: ids.map((tripId) => ({
          tripId,
          tally: opts.purchases?.(tripId, today) ?? NO_DUE,
        })),
      },
    ]
    return dueLineRuns(kinds, opts.go)
  })
}

/**
 * The sentence, as runs. Two kinds, neither wholly late, share one closing
 * „fällig" — „2 Aufgaben (1 überfällig) · 3 Einkäufe fällig". Otherwise each
 * count carries its own word before what is late of it — „2 Aufgaben fällig
 * (1 überfällig)", „1 Aufgabe überfällig" — so no count reads „überfällig
 * fällig" and none ends on a bracket.
 */
function dueLineRuns(
  kinds: readonly Kind[],
  go: (block: DueBlock, tripId: string) => void,
): HeadMetaPart[] | null {
  const named = kinds
    .map((kind) => ({ kind, total: addTallies(kind.perTrip.map((trip) => trip.tally)) }))
    .filter(({ total }) => total.due > 0)
  if (named.length === 0) return null
  const shared = named.length > 1 && named.every(({ total }) => total.overdue < total.due)
  const runs: HeadMetaPart[] = []
  named.forEach(({ kind, total }, i) => {
    if (i > 0) runs.push({ text: ' · ' })
    const first = kind.perTrip.find((trip) => trip.tally.due > 0)!
    runs.push({
      text: t(kind.countKey, { n: total.due }),
      act: () => go(kind.block, first.tripId),
      testid: `due-line-${kind.block}`,
    })
    if (total.overdue === total.due) {
      runs.push({ text: ` ${t('dashboard.overdueWord')}`, late: true })
      return
    }
    if (!shared) runs.push({ text: ` ${t('dashboard.dueWord')}` })
    if (total.overdue > 0) {
      runs.push({ text: ` ${t('dashboard.overdueOf', { n: total.overdue })}`, late: true })
    }
  })
  if (shared) runs.push({ text: ` ${t('dashboard.dueWord')}` })
  return runs
}
