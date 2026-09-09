/**
 * The sentence FR-27.10 answers with. Pure, so the six outcomes are a list of
 * cases with their own test rather than a nested ternary inside M4's handler.
 *
 * The requirement's rule is that **the result is always reported** — a group
 * that changed nothing has to say why, or the tap is indistinguishable from a
 * broken button. That is also why `null` gets a sentence: the add refuses a
 * trip whose rows are not on the device yet, which is reachable on a cold load
 * (M4 paints before its partition is pulled), and a refusal nobody can see is
 * the worst of the outcomes rather than the neutral one.
 */
import { t } from '@/i18n'
import type { GroupAdditionReport } from '@/domain/groupAdd'

export function groupAdditionMessage(report: GroupAdditionReport | null): string {
  if (!report) return t('quickAdd.groupNotReady')

  const { groupName, added, alreadyPresent, unassignable } = report
  if (added === 0) {
    // Asked first, because it is the only one of the three that tells the user
    // what to do next. Both of the others can be true beside it and neither
    // sends them anywhere: "contributes nothing" is wrong about a group that
    // does, and "already fully on the list" points at rows that are not there.
    if (unassignable.length > 0) {
      return t('quickAdd.groupNeedsTravelers', { name: groupName, n: unassignable.length })
    }
    return alreadyPresent.length > 0
      ? t('quickAdd.groupAllPresent', { name: groupName })
      : t('quickAdd.groupEmpty', { name: groupName })
  }

  const base = t('quickAdd.groupAdded', { name: groupName, n: added })
  const rest =
    alreadyPresent.length > 0 ? t('quickAdd.groupAlreadyPart', { n: alreadyPresent.length }) : ''
  const waiting =
    unassignable.length > 0 ? t('quickAdd.groupNeedsTravelerPart', { n: unassignable.length }) : ''
  return `${base}${rest}${waiting}`
}
