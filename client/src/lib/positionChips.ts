/**
 * The summary chips on M8's collapsed position row (FR-27.2).
 *
 * A collapsed row has to say what deviates from the default without opening,
 * and *which* facts deviate is a product rule with four sources — the
 * assignment, the mode, FR-5.6's late packer and FR-27.7's tasks — plus the
 * conditions, whose values are attribute ids the catalogue words. It lived in
 * the template editor, the second-largest view and one with no component
 * test, so the one thing the row promises was asserted only by an e2e case
 * reading the joined string.
 *
 * The task count is a parameter rather than a store read: it is the only fact
 * here that is not on the row, and passing it keeps the rule pure.
 */

import { t } from '@/i18n'
import { attributeLabel } from '@/lib/attributeLabels'
import { modeLabel } from '@/lib/modeLabels'
import type { TemplateItem } from '@/types/domain'
import { isShoppingMode } from '@/types/domain'

/**
 * What the collapsed row says about a position, in reading order. Empty when
 * nothing deviates — the row's own template words that case as "Standard",
 * because a chip saying "default" is the one chip nobody needs.
 */
export function positionChips(pos: TemplateItem, taskCount: number): string[] {
  const chips: string[] = []
  if (pos.assignment === 'per_person') chips.push(t('templates.perPerson'))
  // Only a shopping mode is worth a chip: 🧳 is the dominant case, and
  // `modeLabels.ts` gives the same reason for its silent pack.
  if (isShoppingMode(pos.default_mode)) chips.push(modeLabel(pos.default_mode))
  if (pos.late_packer) chips.push(t('mode.latePacker'))
  if (taskCount) chips.push(t('templates.prepChip', { n: taskCount }))
  for (const value of Object.values(pos.conditions ?? {})) {
    if (typeof value === 'string') chips.push(attributeLabel(value))
  }
  return chips
}
