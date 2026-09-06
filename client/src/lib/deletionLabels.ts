/**
 * What FR-24.3's two deletions are called, for the four surfaces that say it.
 *
 * The rule is one sentence — *retire, remove, or remove-but-this-device-cannot-
 * be-sure* — and it was written out four times: M10's delete section, M7's
 * confirm, and M23's two row builders. Three of the four spelled the `certain`
 * branch as its own ternary, so a fifth surface, or a change to what an
 * uncertain remove says, meant finding them all (§4a).
 *
 * The subject is a parameter because the two key families are the product's,
 * not this module's: an item and a Vorlage are retired for different reasons
 * (FR-24.3 vs FR-9.2's provenance) and the catalogue words them separately.
 */

import { t, type MessageKey } from '@/i18n'
import { DELETION_RETIRE, type DeletionKind } from '@/domain/masterDeletion'

/** A master item's keys — M10 and M23's item segment. */
export const DELETION_SUBJECT_ITEM = 'item'
/** A Vorlage's keys — M7 and M23's Vorlagen segment. */
export const DELETION_SUBJECT_TEMPLATE = 'template'

/** Which of the two key families a surface asks with. */
export type DeletionSubject = typeof DELETION_SUBJECT_ITEM | typeof DELETION_SUBJECT_TEMPLATE

/**
 * What this device knows about the delete it is about to describe — the part
 * of `masterItemDeletionOutlook`/`templateDeletionOutlook`'s answer that words
 * it. Narrowed here rather than imported, because that type lives with the
 * orchestrator's actions and `lib/` does not reach upwards.
 */
export interface DeletionOutlookFacts {
  kind: DeletionKind
  certain: boolean
}

/** The three sentences each subject owns. */
const DELETION_KEYS = {
  [DELETION_SUBJECT_ITEM]: {
    retire: 'items.editor.deleteRetire',
    remove: 'items.editor.deleteRemove',
    removeMaybe: 'items.editor.deleteRemoveMaybe',
  },
  [DELETION_SUBJECT_TEMPLATE]: {
    retire: 'templates.deleteRetire',
    remove: 'templates.deleteRemove',
    removeMaybe: 'templates.deleteRemoveMaybe',
  },
} as const satisfies Record<
  DeletionSubject,
  Record<'retire' | 'remove' | 'removeMaybe', MessageKey>
>

/**
 * The catalogue key for an outlook. `certain` is only ever consulted on the
 * remove branch: a retire is the same act whether or not this device has seen
 * every trip, because one reference is already enough (ADR-032).
 */
export function deletionOutlookKey(
  subject: DeletionSubject,
  outlook: DeletionOutlookFacts,
): MessageKey {
  const keys = DELETION_KEYS[subject]
  if (outlook.kind === DELETION_RETIRE) return keys.retire
  return outlook.certain ? keys.remove : keys.removeMaybe
}

/** The localised sentence for an outlook. */
export function deletionSentence(subject: DeletionSubject, outlook: DeletionOutlookFacts): string {
  return t(deletionOutlookKey(subject, outlook))
}
