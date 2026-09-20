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

/**
 * FR-24.14's merge, asked and confirmed: which of the picked tags survives,
 * then one act over the whole set.
 *
 * The **same flow** as {@link promptTagMerge} — one picker, one confirm, one
 * toast — because a merge that reads differently depending on how many tags
 * it was started with is two features sharing a mutation. What differs is
 * only where the target comes from: not the axis, but the selection itself.
 * Picking a target *outside* the selection would make „these three are one
 * thing" mean something else on the next screen.
 *
 * The targets are offered **largest first**, counted in assignments: the tag
 * most items already carry is almost always the real one, and it is also the
 * choice that moves the fewest rows. An action sheet cannot preselect, so
 * the order is what recommends it.
 *
 * Resolves to how many items ended up under the target, or null when nothing
 * was merged.
 */
export async function promptTagMergeMany(
  tags: readonly Tag[],
  deps: {
    /** How many assignments each picked tag has, by tag id. */
    usage: Map<string, number>
    merge: (sourceIds: string[], targetId: string) => number
  },
): Promise<number | null> {
  if (tags.length < 2) return null
  const byUsage = [...tags].sort(
    (a, b) =>
      (deps.usage.get(b.id) ?? 0) - (deps.usage.get(a.id) ?? 0) || a.name.localeCompare(b.name),
  )

  const picker = await actionSheetController.create({
    header: t('items.tagsMergeManyTitle'),
    buttons: [
      ...byUsage.map((tag) => ({
        text: t('items.tagsMergeManyCount', { name: tag.name, n: deps.usage.get(tag.id) ?? 0 }),
        data: tag.id,
        htmlAttributes: { 'data-testid': `m9-tag-merge-into-${tag.name}` },
      })),
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await picker.present()
  const { data: targetId, role } = await picker.onDidDismiss<string>()
  if (role === 'cancel' || !targetId) return null

  const target = byUsage.find((tag) => tag.id === targetId)
  if (!target) return null
  const sources = byUsage.filter((tag) => tag.id !== targetId)

  // The upper bound on what moves, not the exact number: an item carrying two
  // of the sources ends under the target once. The confirm may overstate the
  // work and may never understate it — the toast afterwards reports what the
  // merge actually did.
  const moving = sources.reduce((sum, tag) => sum + (deps.usage.get(tag.id) ?? 0), 0)

  const ok = await confirmDestructive({
    header: t('items.tagsMergeManyTitle'),
    message: t('items.tagsMergeManyConfirmBody', {
      n: moving,
      m: sources.length,
      target: target.name,
    }),
    confirmLabel: t('items.tagMergeConfirm'),
    testid: 'm9-tags-merge-many-confirm',
  })
  if (!ok) return null

  const moved = deps.merge(
    sources.map((tag) => tag.id),
    target.id,
  )
  await presentToast({ message: t('items.tagMerged', { n: moved, tag: target.name }) })
  return moved
}
