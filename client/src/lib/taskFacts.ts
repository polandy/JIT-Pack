/**
 * The sentences a task says about itself (FR-7.7) — who wrote it and when,
 * who ticked it off and when.
 *
 * `lib/` rather than `domain/`, for `rowFacts.ts`'s reason: these read the
 * catalogue, and a domain module must not import the i18n layer. They are
 * that file's `packedStampText` and `boughtStampText` applied to a task, and
 * they are written here rather than there because a task is not a row — the
 * two files would otherwise have to agree on what „the row" means.
 *
 * Both follow the same rule as their neighbours: **a missing name is silence,
 * not a placeholder.** Local and Single-User Mode have nobody to name (G-8),
 * and a line then states the moment alone rather than inventing a person.
 */
import { relativeStamp } from '@/domain/stamp'
import { currentLocale, t } from '@/i18n'
import { stampText, type NameOf } from './rowFacts'

/** The FR-7.7 facts a line or a sheet reads off a task. */
export interface TaskStamps {
  created_at: string | null
  author_id: string | null
  resolved_at: string | null
  resolved_by_user_id: string | null
}

/** „erstellt von Andy · heute 14:32", or null when the task says neither. */
export function createdStampText(
  task: TaskStamps,
  nameOf: NameOf,
  now: Date = new Date(),
): string | null {
  return stampSentence(task.created_at, task.author_id, nameOf, now, {
    withWho: 'tasks.createdBy',
    withoutWho: 'tasks.createdByUnknown',
  })
}

/** „erledigt von Sia · gestern 09:15", or null while the task is open. */
export function resolvedStampText(
  task: TaskStamps,
  nameOf: NameOf,
  now: Date = new Date(),
): string | null {
  return stampSentence(task.resolved_at, task.resolved_by_user_id, nameOf, now, {
    withWho: 'tasks.resolvedBy',
    withoutWho: 'tasks.resolvedByUnknown',
  })
}

/**
 * The shape both sentences share: a moment, a person who may be unnameable,
 * and the two keys that word the pair.
 */
function stampSentence(
  at: string | null,
  by: string | null,
  nameOf: NameOf,
  now: Date,
  keys: {
    withWho: 'tasks.createdBy' | 'tasks.resolvedBy'
    withoutWho: 'tasks.createdByUnknown' | 'tasks.resolvedByUnknown'
  },
): string | null {
  if (!at && !by) return null
  const when = stampText(at ? relativeStamp(at, now, currentLocale()) : null)
  const who = nameOf(by)
  if (who) return t(keys.withWho, { who, when })
  return when ? t(keys.withoutWho, { when }) : null
}

/**
 * FR-7.7 with Q3 B: the one line a task carries under its words, and which of
 * the two it is depends on where the task stands.
 *
 * An open task is a promise, so it says who made it; a resolved one is a
 * record, so it says who kept it. Showing both would double every line in the
 * list to say, on the open ones, nothing that is not already true of all of
 * them — and the finished ones are folded away, where the second line costs
 * nothing to reach.
 */
export function taskSubline(
  task: TaskStamps & { task_state: string },
  nameOf: NameOf,
  now: Date = new Date(),
): string | null {
  return task.task_state === 'resolved'
    ? resolvedStampText(task, nameOf, now)
    : createdStampText(task, nameOf, now)
}
