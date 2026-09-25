/**
 * FR-7.11: a due date in words — „Heute", „Morgen", „In 2 Tagen", a short
 * date further out, and „Überfällig" once it has passed (the sheet names the
 * day itself).
 *
 * `lib/` rather than `domain/` for `taskFacts.ts`'s reason: it reads the
 * catalogue. The rule it words — which of the four states a task is in — is
 * `domain/taskDue.ts`'s, and this file only names it.
 */
import {
  daysBetween,
  dueStateOf,
  DUE_LATER,
  DUE_OVERDUE,
  DUE_TODAY,
  type DueFacts,
  type DueState,
} from '@/domain/taskDue'
import { formatDate, t } from '@/i18n'

/** What a line or a sheet shows for a task's date, or null for none. */
export interface DueLabel {
  state: DueState
  text: string
}

/** A calendar day as a local `Date` — never `new Date(iso)`, which is UTC midnight. */
function localDay(iso: string): Date {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * „Fr., 17.7." — the day a task is due, short enough for a line: the badge
 * sits beside the task's words and must never be what squeezes them.
 */
export function shortDueDay(iso: string): string {
  return formatDate(localDay(iso), { weekday: 'short', day: 'numeric', month: 'numeric' })
}

/** dueLabel words where a task stands against today, or null where it has no date or is done. */
export function dueLabel(task: DueFacts, today: string): DueLabel | null {
  const state = dueStateOf(task, today)
  if (state === null) return null
  const due = task.due_date!
  if (state === DUE_OVERDUE) return { state, text: t('tasks.dueOverdue') }
  if (state === DUE_TODAY) return { state, text: t('tasks.dueToday') }
  if (state === DUE_LATER) return { state, text: shortDueDay(due) }
  const days = daysBetween(today, due)
  return { state, text: days === 1 ? t('tasks.dueTomorrow') : t('tasks.dueInDays', { n: days }) }
}
