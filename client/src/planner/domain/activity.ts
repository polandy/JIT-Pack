/**
 * How the activity log reads the planner's rows (FR-32.2) — pure, no I/O, no
 * Vue. The log knows no module's columns; it asks these readers, which the
 * composition root binds (`lib/activityReaders.ts`).
 *
 * An idea, its discussion and its pictures read the way every row does —
 * added, changed, removed — and so does an entry of the day plan's own, in an
 * area of its own (FR-29.15). A vote is the one row whose write is an act of its
 * own: casting it, and taking it back.
 */
import { ACTIVITY_OP } from '@/api/types'
import { valueAfter, type ActivityReader, type ActivityReaders } from '@/lib/activityReaders'
import type { IdeaVote } from '@/types/domain'
import { TABLE } from '@/types/tables'

const VOTE = 'vote' satisfies keyof IdeaVote

const ideaRows: ActivityReader = { area: 'ideas' }
const dayPlanRows: ActivityReader = { area: 'dayplan' }

const votes: ActivityReader = {
  area: 'ideas',
  classify(entry) {
    if (entry.op === ACTIVITY_OP.delete) return undefined
    const cast = Boolean(valueAfter(entry, VOTE))
    // A vote row created without a vote says nothing anyone chose.
    if (entry.op === ACTIVITY_OP.insert) return cast ? 'voted' : null
    return cast ? 'voted' : 'unvoted'
  },
}

/** The module's readers, by table. */
export const plannerActivityReaders: ActivityReaders = {
  [TABLE.ideas]: ideaRows,
  [TABLE.ideaComments]: ideaRows,
  [TABLE.ideaImages]: ideaRows,
  [TABLE.ideaVotes]: votes,
  [TABLE.dayEntries]: dayPlanRows,
}
