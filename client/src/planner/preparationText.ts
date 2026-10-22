/**
 * An idea's preparation in words (FR-29.21) — a step's lead, and what the
 * plan sheet says of the open steps for the day being chosen. The rule of
 * when a step falls due is `domain/shared/ideaPreparation.ts`'s; this file
 * only names it, since naming reads the catalogue.
 */
import { t, type MessageKey } from '@/i18n'
import type { IdeaPreparation } from '@/domain/shared/ideaBridge'
import { PREPARATION_LEADS, preparationDue } from '@/domain/shared/ideaPreparation'
import { shortDueDay } from '@/lib/taskDueText'

const LEAD_KEY: Record<number, MessageKey | undefined> = {
  1: 'ideas.prep.lead.1',
  3: 'ideas.prep.lead.3',
  7: 'ideas.prep.lead.7',
  14: 'ideas.prep.lead.14',
} satisfies Record<(typeof PREPARATION_LEADS)[number], MessageKey>

/** „1 Woche vorher" — and a lead the sheet does not offer, written elsewhere, in days. */
export function leadName(leadDays: number): string {
  const key = LEAD_KEY[leadDays]
  return key ? t(key) : t('ideas.prep.leadDays', { n: leadDays })
}

/** One open step as the plan sheet states it. */
export interface PlanNote {
  id: string
  text: string
  /** Its lead has already passed for the chosen day. */
  late: boolean
}

/**
 * What planning the idea on `day` makes of its open steps: the day each falls
 * due, or that its lead has already passed. Nothing while no day is chosen.
 */
export function planNotes(
  steps: readonly IdeaPreparation[],
  day: string | null,
  today: string,
): PlanNote[] {
  if (day === null) return []
  return steps
    .filter((step) => !step.done)
    .map((step) => {
      const due = preparationDue(step.leadDays, { plannedOn: day, dropped: false }) ?? day
      const late = due < today
      return {
        id: step.id,
        late,
        text: late
          ? t('ideas.prep.planLate', { title: step.title, lead: leadName(step.leadDays) })
          : t('ideas.prep.planDue', { title: step.title, day: shortDueDay(due) }),
      }
    })
}
