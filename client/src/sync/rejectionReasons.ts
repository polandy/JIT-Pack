/**
 * The reasons the server refuses a mutation (Sync-API §5).
 *
 * A `rejected` outcome carries one of these in the push result's `error`.
 * The set is closed and declared server-side (`store.RejectReason`); it is
 * repeated here because it is compared against, and because the *sentence*
 * has to be written in the user's language, which the server does not know.
 *
 * Anything outside the set — a validation error naming a column, an older
 * server saying nothing at all — is deliberately not translated: raw server
 * words are diagnostics, not copy, and G-2 keeps its general hint for them.
 */

import { t, type MessageKey } from '@/i18n'

/** The vocabulary, named once (CODING_PRINCIPLES §4a). */
export const REJECTION_REASON = Object.freeze({
  notAuthorized: 'not_authorized',
  outOfScope: 'out_of_scope',
  stillReferenced: 'still_referenced',
  templateScope: 'template_scope',
  constraintViolated: 'constraint_violated',
} as const)

/** One of the reasons above. */
export type RejectionReason = (typeof REJECTION_REASON)[keyof typeof REJECTION_REASON]

const REASON_KEYS: Record<RejectionReason, MessageKey> = {
  [REJECTION_REASON.notAuthorized]: 'sync.detail.rejected.notAuthorized',
  [REJECTION_REASON.outOfScope]: 'sync.detail.rejected.outOfScope',
  [REJECTION_REASON.stillReferenced]: 'sync.detail.rejected.stillReferenced',
  [REJECTION_REASON.templateScope]: 'sync.detail.rejected.templateScope',
  [REJECTION_REASON.constraintViolated]: 'sync.detail.rejected.constraintViolated',
}

/**
 * The catalogue key that explains `reason`, or null when the server said
 * something this build has no sentence for.
 */
export function rejectionReasonKey(reason: string | null | undefined): MessageKey | null {
  if (!reason) return null
  return REASON_KEYS[reason as RejectionReason] ?? null
}

/**
 * The sentence the toast says when a push came back with refusals
 * (ADR-031). Composed here rather than in the view because it is the same
 * two halves everywhere: how many changes were undone, and — where this
 * build has a sentence for it — why.
 */
export function rejectionToastMessage(count: number, reason: string | null): string {
  const headline = t('sync.rejectionToast', { n: count })
  const key = rejectionReasonKey(reason)
  return key ? `${headline}. ${t(key)}` : `${headline}.`
}
