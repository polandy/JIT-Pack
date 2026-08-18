/**
 * Wording for FR-27.4's group changes, in both tenses.
 *
 * The rows are synced, so they store *what* changed and never a sentence — a
 * sentence would freeze one language into the database. Both surfaces that
 * read them (M2's log, M4's proposal) word them here rather than each
 * carrying its own copy, because they say the same thing about the same
 * structure and only the tense differs: M4 asks about what *would* happen,
 * M2 records what *did*.
 */
import type { AppliedChange } from '@/types/domain'
import { t, type MessageKey } from '@/i18n'

/** Everything the wording needs — an applied row and a planned one both fit. */
export type ChangeSummary = Pick<
  AppliedChange,
  'kind' | 'item_name' | 'source_template_name' | 'detail'
>

/**
 * The two tenses, spelled out rather than composed from a prefix: a built key
 * is invisible to the type checker and to anything that greps the catalogue
 * for dead entries.
 */
type WordingKeys = Record<'added' | 'removed' | 'quantity' | 'tasks' | 'changed', MessageKey>

const APPLIED: WordingKeys = {
  added: 'trips.appliedAdded',
  removed: 'trips.appliedRemoved',
  quantity: 'trips.appliedQuantity',
  tasks: 'trips.appliedTasks',
  changed: 'trips.appliedChanged',
}

const PROPOSED: WordingKeys = {
  added: 'trips.proposedAdded',
  removed: 'trips.proposedRemoved',
  quantity: 'trips.proposedQuantity',
  tasks: 'trips.proposedTasks',
  changed: 'trips.proposedChanged',
}

/** Past tense: what the trip took over (M2's log). */
export function describeAppliedChange(entry: ChangeSummary): string {
  return describe(entry, APPLIED)
}

/** Present tense: what the trip is being asked to take over (M4's proposal). */
export function describeProposedChange(entry: ChangeSummary): string {
  return describe(entry, PROPOSED)
}

/**
 * An unrecognised field falls back to the plain "changed" line rather than
 * rendering a raw column name at the user — a new propagated field must not
 * be able to leak its schema name into the UI.
 */
function describe(entry: ChangeSummary, keys: WordingKeys): string {
  const params = { group: entry.source_template_name, item: entry.item_name }
  if (entry.kind === 'added') return t(keys.added, params)
  if (entry.kind === 'removed') return t(keys.removed, params)
  if (entry.detail?.field === 'quantity') {
    return t(keys.quantity, {
      ...params,
      from: String(entry.detail.from),
      to: String(entry.detail.to),
    })
  }
  if (entry.detail?.field === 'tasks') return t(keys.tasks, params)
  return t(keys.changed, params)
}
