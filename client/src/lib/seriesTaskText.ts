/**
 * FR-13.4: a series task's lead in words (ADR-106). The planner's
 * `preparationText.ts` names the same shape of thing for an idea's step, but
 * the kernel may not import a feature module, so this file names its own
 * catalogue rather than reusing that one (`scripts/module-boundary-gate.mjs`).
 */
import { t, type MessageKey } from '@/i18n'
import { DUE_OVERDUE, dueState } from '@/domain/shared/dueDay'
import { SERIES_TASK_LEADS, seriesTaskDue } from '@/domain/shared/seriesTask'
import { shortDueDay } from './taskDueText'

const LEAD_KEY: Record<number, MessageKey | undefined> = {
  1: 'tasks.seriesLead.1',
  3: 'tasks.seriesLead.3',
  7: 'tasks.seriesLead.7',
  14: 'tasks.seriesLead.14',
  28: 'tasks.seriesLead.28',
  56: 'tasks.seriesLead.56',
} satisfies Record<(typeof SERIES_TASK_LEADS)[number], MessageKey>

/** „4 Wochen" — a bare lead, and one the chips do not offer, written in days. */
export function seriesLeadName(leadDays: number): string {
  const key = LEAD_KEY[leadDays]
  return key ? t(key) : t('tasks.seriesLead.n', { n: leadDays })
}

/**
 * The sheet's `task-sheet-lead` line for a series task: dated once the trip
 * has a start, otherwise naming only the lead until it does (FR-2.1a).
 */
export function seriesLeadText(leadDays: number, dueDate: string | null): string {
  const lead = seriesLeadName(leadDays)
  return dueDate
    ? t('tasks.dueFromSeries', { day: shortDueDay(dueDate), lead })
    : t('tasks.dueFromSeriesUndated', { lead })
}

/**
 * M16's lead chip for 1 day reads idiomatically (*„Am Vortag"*, the planner's
 * own idiom for the same quantity) rather than as the bare *„1 Tag"* the
 * other leads use — a chip names a choice, not a sentence, and only the
 * 1-day one has an idiom at all. `null` is M16's own *„Kein Termin"* chip:
 * a series task need not carry a lead (FR-13.4).
 */
export function seriesLeadChipName(leadDays: number | null): string {
  if (leadDays === null) return t('tasks.seriesLeadNone')
  return leadDays === 1 ? t('tasks.seriesLeadChip1') : seriesLeadName(leadDays)
}

/** M16's line under a series task: *„4 Wochen vor Abreise"*, or *„Kein Termin"*. */
export function seriesLeadLineText(leadDays: number | null): string {
  return leadDays === null
    ? t('tasks.seriesLeadNone')
    : t('tasks.seriesLeadLine', { lead: seriesLeadName(leadDays) })
}

/** One offer-sheet row's due wording, and whether it reads overdue (ADR-106). */
export interface SeriesOfferDue {
  text: string
  overdue: boolean
}

/**
 * FR-13.4's offer sheet (M22/M16): a ticked line's due day, read against
 * the trip it would land on — *„fällig Sa., 19.6."*, *„ohne Termin"* while
 * the trip has no start or the task none, or the amber *„überfällig"* once
 * the lead has already passed.
 */
export function seriesOfferDue(
  leadDays: number | null,
  tripStartDate: string | null,
  today: string,
): SeriesOfferDue {
  const due = leadDays === null ? null : seriesTaskDue(leadDays, tripStartDate)
  if (due === null) return { text: t('tasks.offerUndated'), overdue: false }
  if (dueState(due, today) === DUE_OVERDUE) return { text: t('tasks.offerOverdue'), overdue: true }
  return { text: t('tasks.offerDueDay', { day: shortDueDay(due) }), overdue: false }
}
