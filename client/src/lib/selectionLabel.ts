import { t } from '@/i18n'

/**
 * What a selection bar says about a selection (G-20): *„Nichts ausgewählt"* at
 * zero, *„N ausgewählt"* from one — two forms, since one entry is not a
 * plural. One function for the app bar and the tag sheet's head, so the two
 * say it alike.
 */
export function selectionLabel(count: number): string {
  return count === 0 ? t('selection.none') : t('selection.count', { n: count })
}
