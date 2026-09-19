import { actionSheetController } from '@ionic/vue'

import { t } from '@/i18n'
import { confirmDestructive } from '@/lib/confirm'
import { presentToast } from '@/lib/toast'
import type { Tag } from '@/types/domain'

/**
 * FR-24.10's merge, asked and confirmed: pick the target, confirm with the
 * number of items moving, merge, report. One flow for the two screens that
 * offer it — M9's tag manager and M24's „Tag mit nur einem Artikel"
 * (FR-24.12) — because a merge that reads differently depending on where it
 * was started is two features that happen to share a mutation.
 *
 * The target is picked from an action sheet rather than a second modal: an
 * overlay opened from inside an overlay is the scroll clamp FR-24.8 already
 * paid for, and the list is the same tags the sheet behind it is showing.
 *
 * Resolves to how many items moved, or null when nothing was merged.
 */
export async function promptTagMerge(
  tag: Tag,
  deps: {
    /** The whole axis; the tag itself is left out of the targets here. */
    tags: readonly Tag[]
    /** How many assignments the source has — the confirm's number. */
    usage: number
    merge: (sourceId: string, targetId: string) => number
  },
): Promise<number | null> {
  const targets = deps.tags.filter((other) => other.id !== tag.id)
  if (targets.length === 0) {
    await presentToast({ message: t('items.tagMergeNoTarget', { tag: tag.name }) })
    return null
  }

  const picker = await actionSheetController.create({
    header: t('items.tagMergeTitle', { tag: tag.name }),
    buttons: [
      ...targets.map((other) => ({
        text: other.name,
        data: other.id,
        htmlAttributes: { 'data-testid': `m9-tag-merge-into-${other.name}` },
      })),
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await picker.present()
  const { data: targetId, role } = await picker.onDidDismiss<string>()
  if (role === 'cancel' || !targetId) return null

  const target = targets.find((other) => other.id === targetId)
  if (!target) return null

  const ok = await confirmDestructive({
    header: t('items.tagMergeTitle', { tag: tag.name }),
    message: t('items.tagMergeConfirmBody', {
      n: deps.usage,
      source: tag.name,
      target: target.name,
    }),
    confirmLabel: t('items.tagMergeConfirm'),
    testid: 'm9-tag-merge-confirm',
  })
  if (!ok) return null

  const moved = deps.merge(tag.id, target.id)
  await presentToast({ message: t('items.tagMerged', { n: moved, tag: target.name }) })
  return moved
}
