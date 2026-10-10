/**
 * M6's batch (FR-30.9, FR-30.12): the chosen own lines retagged, handed to one
 * person or removed in one act, across both lists — one write per list, one
 * undo for both, and the selection ends with the act (M9's own rule).
 *
 * The batch is the chosen lines still open, as M25's `selectedTasks` is: a
 * line bought or removed elsewhere while chosen leaves the acts, the sheets'
 * counts and the bar alike, as it already leaves the app bar's count.
 */
import { computed, ref, type Ref } from 'vue'

import type { RowSelection } from '@/composables/shared/useRowSelection'
import { presentToast } from '@/composables/shared/toast'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import type { NameOf } from '@/lib/rowFacts'
import type { ShoppingLine } from '@/kernel/shoppingSources'
import { SHOPPING_MODES } from '@/types/domain'
import type { BulkResult, OwnEntriesSource } from './actions'

export interface ShoppingBatchHost {
  tripId: string
  own: OwnEntriesSource
  selection: RowSelection
  /** Every open own line, across both lists — the only lines a selection can act on. */
  ownOpenLines: Readonly<Ref<ShoppingLine[]>>
  /** The screen's person picker over the trip's own people (FR-30.12). */
  pickAssignee: (header: string, current: string | null) => Promise<string | null | undefined>
  nameOf: NameOf
}

export function useShoppingBatch(host: ShoppingBatchHost) {
  const { own, selection, tripId } = host
  const selectedLines = computed(() =>
    host.ownOpenLines.value.filter((line) => selection.selected.value.has(line.key)),
  )
  const selectedKeys = computed(() => new Set(selectedLines.value.map((line) => line.key)))

  /** The tag sheet for the batch, open while a tag is being chosen. */
  const bulkSheetOpen = ref(false)

  /** The last batch's undo, live for as long as its snackbar (M9's `bulkUndo`). One batch at a time. */
  let bulkUndo: (() => void) | null = null

  function undoBulk() {
    const undo = bulkUndo
    bulkUndo = null
    undo?.()
  }

  /**
   * Ends the mode and says what the batch did, with its undo — or, given
   * `nothing`, that it did nothing.
   */
  async function settle(
    results: BulkResult[],
    message: (touched: number) => string,
    nothing?: string,
  ) {
    const touched = results.reduce((n, result) => n + result.touched, 0)
    selection.end()
    if (touched === 0) {
      if (nothing === undefined) return
      await presentToast({
        message: nothing,
        positionAnchor: FAB_ANCHOR.m6,
        cssClass: 'pack-toast',
      })
      return
    }
    bulkUndo = () => results.forEach((result) => result.undo())
    await presentToast({
      message: message(touched),
      positionAnchor: FAB_ANCHOR.m6,
      cssClass: 'pack-toast',
      buttons: [{ text: t('packing.undo'), handler: () => undoBulk() }],
    })
  }

  /** FR-30.9: one tag for the batch. */
  async function applyBulkTag(tag: string | null) {
    const results = SHOPPING_MODES.map((list) =>
      own.bulkSetTag(tripId, list, selectedKeys.value, tag),
    )
    bulkSheetOpen.value = false
    await settle(
      results,
      (n) =>
        t(tag !== null ? 'shopping.bulkTagged' : 'shopping.bulkUntagged', { n, tag: tag ?? '' }),
      t('shopping.bulkNothingToDo'),
    )
  }

  /** FR-30.12: one person for the batch, or nobody. */
  async function bulkAssign() {
    const title = t('shopping.bulkAssignTitle', { n: selectedLines.value.length })
    const picked = await host.pickAssignee(title, null)
    if (picked === undefined) return
    const results = SHOPPING_MODES.map((list) =>
      own.bulkSetAssignee(tripId, list, selectedKeys.value, picked),
    )
    await settle(
      results,
      (n) =>
        picked === null
          ? t('shopping.bulkUnassigned', { n })
          : t('shopping.bulkAssigned', { n, who: host.nameOf(picked) ?? '' }),
      t('shopping.bulkNothingToDo'),
    )
  }

  /**
   * FR-30.9: the batch removed. No question first — the toast's undo puts
   * every entry back, as it does each batch here; nothing removed, nothing said.
   */
  async function bulkRemove() {
    const results = SHOPPING_MODES.map((list) => own.bulkRemove(tripId, list, selectedKeys.value))
    await settle(results, (n) => t('shopping.bulkRemoved', { n }))
  }

  return { selectedLines, bulkSheetOpen, applyBulkTag, bulkAssign, bulkRemove }
}
