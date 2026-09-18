/**
 * What FR-5.8's confirmation says before a packing-list row is removed.
 *
 * The decision to ask is the domain's (`removalNeedsConfirm`); this is only
 * the wording, one sentence per thing the removal takes along, in the order a
 * reader weighs them — what the row *is* first, then what it carries.
 */
import { t } from '@/i18n'
import type { RowRemoval } from '@/domain/rowRemoval'

/** The confirmation's body: the lead, then each cost the removal carries. */
export function removalSentence(removal: RowRemoval<{ name: string }>): string {
  const parts = [t('packing.removeConfirmLead')]
  if (removal.packed > 0) parts.push(t('packing.removeConfirmPacked', { n: removal.packed }))
  if (removal.notes > 0) parts.push(t('packing.removeConfirmNotes', { n: removal.notes }))
  if (removal.companions.length > 0) {
    parts.push(
      t('packing.removeConfirmCompanions', {
        names: removal.companions.map((row) => row.name).join(', '),
      }),
    )
  }
  return parts.join(' ')
}
