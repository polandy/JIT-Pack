/**
 * Press and hold (FR-5.5, FR-5.2): the row's menu, and the cluster head's,
 * whose entries act on every instance under it (FR-25.26).
 *
 * The same gesture M7 uses, chosen over the swipe it replaces: the swipe
 * was announced by nothing and its option panel broke out of the row's
 * card, which is where it also lost the M7 round. The 500 ms live in
 * useLongPress, unit-tested with fake timers; `contextmenu` covers desktop
 * and is the seam the e2e case drives.
 */
import { actionSheetController } from '@ionic/vue'
import { peopleOutline, timeOutline } from 'ionicons/icons'

import { useLongPress } from '@/composables/useLongPress'
import {
  clusterMenuEntries,
  clusterTargets,
  type ClusterFanOut,
  type ClusterInstance,
  type ClusterMenuAction,
  type ClusterMenuContext,
} from '@/domain/clusterActions'
import type { PackingCluster } from '@/domain/packingView'
import { rowMenuEntries, type RowMenuAction } from '@/domain/rowMenu'
import { t, type MessageKey } from '@/i18n'
import { ROW_MENU_BUTTONS } from '@/lib/rowMenuButtons'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK, type TripItem } from '@/types/domain'

import type { PackingCore } from './usePackingCore'
import type { RowActions } from './useRowActions'
import type { RowQuantity } from './useRowQuantity'

/**
 * Label and glyph per cluster entry; the decision is the domain's. The head
 * speaks the row's words for the row's actions — its sub-header already says
 * how many rows they reach — and keeps its own for the three it had first,
 * whose „für alle" wording says what a row's could not.
 */
const CLUSTER_MENU_BUTTONS: Record<
  ClusterMenuAction,
  { labelKey: MessageKey; icon: string; role?: 'destructive' }
> = {
  ...ROW_MENU_BUTTONS,
  latePackerOn: { labelKey: 'packing.clusterLatePackerOn', icon: timeOutline },
  latePackerOff: { labelKey: 'packing.clusterLatePackerOff', icon: timeOutline },
  assignAll: { labelKey: 'packing.clusterAssignAll', icon: peopleOutline },
}

/** The two holds, the menus they open, and whether one is up. */
export type PackingMenus = ReturnType<typeof usePackingMenus>

/** Builds {@link PackingMenus} over the page's core and the acts it reaches. */
export function usePackingMenus(core: PackingCore, acts: RowActions, quantity: RowQuantity) {
  const { tripId, orchestrator, locked, rowUndo, armRowsUndo } = core

  const hold = useLongPress<TripItem>(openRowMenu)
  /** The same press the rows use; the short tap stays the fold (FR-25.23). */
  const clusterHold = useLongPress<PackingCluster>(openClusterMenu)

  /**
   * Row taps are ignored while the menu lives — same reasoning as M7's: the
   * release of a hold usually lands on the overlay rather than the row, so a
   * "swallow the next click" flag would go stale and eat a later tap.
   */
  let active = false

  /** Whether a menu is up, so a tap delivered by its release is swallowed. */
  function menuActive(): boolean {
    return active
  }

  function runRowMenu(action: RowMenuAction, item: TripItem): void {
    switch (action) {
      case 'takeover':
        void acts.onTakeOver(item)
        return
      case 'release':
        acts.onReleaseClaim(item)
        return
      case 'unskip':
        acts.onUnskipItem(item)
        return
      case 'quantity':
        // No event to hang it off: the menu is an overlay, and the row it was
        // opened from may have scrolled. Ionic centres a popover with no
        // reference, which is where the menu itself just was.
        quantity.open(item)
        return
      case 'packingNow':
        acts.onPackingNow(item)
        return
      case 'skip':
        acts.onSkipItem(item)
        return
      case 'buyLocal':
        acts.onSetMode(item, ITEM_MODE_BUY_LOCAL)
        return
      case 'packInstead':
        acts.onSetMode(item, ITEM_MODE_PACK)
        return
      case 'latePackerOn':
        acts.onLatePacker(item, true)
        return
      case 'latePackerOff':
        acts.onLatePacker(item, false)
        return
      case 'flagUnused':
        void acts.onFlagUnused(item, true)
        return
      case 'unflagUnused':
        void acts.onFlagUnused(item, false)
        return
      case 'remove':
        void acts.onRemoveItem(item)
    }
  }

  async function openRowMenu(item: TripItem) {
    hold.cancel()
    // A touch hold can fire twice (the timer, then the browser's `contextmenu`).
    if (active) return
    const entries = rowMenuEntries(item, {
      closingPass: core.closingPass.value,
      locked: locked(item),
      canTakeOver: acts.canTakeOver,
      mine: orchestrator.holdsClaim(tripId, item),
      judgeable: core.judgeable.value,
    })
    if (entries.length === 0) return

    active = true
    try {
      const sheet = await actionSheetController.create({
        header: item.name,
        buttons: [
          ...entries.map((action) => ({
            text: t(ROW_MENU_BUTTONS[action].labelKey),
            icon: ROW_MENU_BUTTONS[action].icon,
            role: ROW_MENU_BUTTONS[action].role,
            handler: () => runRowMenu(action, item),
          })),
          { text: t('common.cancel'), role: 'cancel' },
        ],
      })
      await sheet.present()
      await sheet.onDidDismiss()
    } finally {
      // finally, not after the awaits: a failed present() must not leave the
      // list permanently tap-dead.
      active = false
    }
  }

  // --- FR-25.26: the cluster head acts on every instance under it ----------
  //
  // The head is the only line that knows an item is one thing several people
  // carry, and `late_packer` and the FR-25.19 assignment are the two fields
  // that are usually a statement about the item rather than about a person —
  // everybody brushes their teeth on the morning the trip leaves. Said
  // instance by instance it cost one trip through M5 per traveler.

  /**
   * What the head may act on: the instances it *counts*, with the G-3 holder
   * resolved for each. Rows the filter or FR-25.2 removed are not among them —
   * the head's numbers describe the same set, and an action reaching past what
   * the reader can see would be a second, invisible list.
   */
  function clusterInstances(cluster: PackingCluster): ClusterInstance[] {
    return cluster.instanceIds.flatMap((id) => {
      const item = core.allItems.value.find((row) => row.id === id)
      if (!item) return []
      const holder = locked(item) ? orchestrator.lockHolder(tripId, item) : null
      return [
        {
          id: item.id,
          row: item,
          lockedBy: holder ? core.nameOf(holder) : null,
          mine: orchestrator.holdsClaim(tripId, item),
        },
      ]
    })
  }

  /** What the head's rule reads beyond the instances — a row menu's context. */
  function clusterMenuContext(): ClusterMenuContext {
    return {
      closingPass: core.closingPass.value,
      canAssign: core.assignableMembers.value.length > 0,
      judgeable: core.judgeable.value,
    }
  }

  /**
   * Say what a fan-out did — and, where a claim kept it off a row, say that
   * too. A group action that quietly wrote three of four would be indis-
   * tinguishable from one that wrote all four (G-3, advisory).
   */
  function announceFanOut(written: number, total: number, blockedBy: string[]): void {
    void core.announceAct(
      blockedBy.length === 0
        ? t('packing.fanOutApplied', { n: written })
        : t('packing.fanOutPartial', {
            n: written,
            total,
            who: blockedBy.join(', '),
          }),
    )
  }

  /**
   * The name a fan-out's own snackbar reports under: the item, and — where a
   * claim kept the write off some instances — how many it did reach. The skip
   * and the removal carry an undo, so they cannot hand their report to
   * {@link announceFanOut}'s toast without losing it.
   */
  function fanOutName(name: string, plan: ClusterFanOut): string {
    if (plan.blockedBy.length === 0) return name
    const total = plan.targetIds.length + plan.blockedBy.length
    return t('packing.clusterPartialName', { name, n: plan.targetIds.length, total })
  }

  async function runClusterMenu(action: ClusterMenuAction, cluster: PackingCluster): Promise<void> {
    const instances = clusterInstances(cluster)
    const plan = clusterTargets(action, instances, clusterMenuContext())
    const rows = core.rowsOf(plan.targetIds)
    const reached = plan.targetIds.length + plan.blockedBy.length
    const report = () => announceFanOut(rows.length, reached, plan.blockedBy)

    switch (action) {
      case 'assignAll': {
        // The head has no assignment of its own to show as picked: its instances
        // may disagree, and presenting one of them as the cluster's answer would
        // be a claim the model does not make.
        const picked = await core.pickAssignee(cluster.name, null)
        if (picked === undefined) return
        // Per row: the instances may have disagreed before the fan-out, and the
        // undo gives each its own value back (FR-25.31).
        const previous = new Map(rows.map((row) => [row.id, row.packer_user_id]))
        armRowsUndo(rows, (live) =>
          orchestrator.setPacker(tripId, live, previous.get(live.id) ?? null),
        )
        orchestrator.setPackerForRows(tripId, rows, picked)
        report()
        return
      }
      case 'latePackerOn':
      case 'latePackerOff': {
        const previous = new Map(rows.map((row) => [row.id, row.late_packer]))
        armRowsUndo(rows, (live) =>
          orchestrator.setLatePacker(tripId, live, previous.get(live.id) ?? false),
        )
        orchestrator.setLatePackerForRows(tripId, rows, action === 'latePackerOn')
        report()
        return
      }
      case 'release':
        armRowsUndo(rows, (live) => {
          if (!locked(live)) orchestrator.packingNow(tripId, live)
        })
        for (const row of rows) orchestrator.releaseClaim(tripId, row)
        report()
        return
      case 'unskip':
        rowUndo.armUndo(rows, (records) => orchestrator.restoreSkip(tripId, records))
        for (const row of rows) orchestrator.unskipItem(tripId, row)
        report()
        return
      case 'packingNow':
        armRowsUndo(rows, (live) => {
          if (orchestrator.holdsClaim(tripId, live)) orchestrator.releaseClaim(tripId, live)
        })
        for (const row of rows) orchestrator.packingNow(tripId, row)
        report()
        return
      case 'buyLocal':
      case 'packInstead': {
        const mode = action === 'buyLocal' ? ITEM_MODE_BUY_LOCAL : ITEM_MODE_PACK
        const previous = new Map(rows.map((row) => [row.id, row.mode]))
        armRowsUndo(rows, (live) =>
          orchestrator.setMode(tripId, live, previous.get(live.id) ?? live.mode),
        )
        for (const row of rows) orchestrator.setMode(tripId, row, mode)
        report()
        return
      }
      case 'flagUnused':
      case 'unflagUnused': {
        const previous = new Map(rows.map((row) => [row.id, row.flag_unused]))
        armRowsUndo(rows, (live) =>
          orchestrator.setReviewFlag(tripId, live, 'unused', previous.get(live.id) ?? false),
        )
        for (const row of rows) {
          orchestrator.setReviewFlag(tripId, row, 'unused', action === 'flagUnused')
        }
        report()
        return
      }
      case 'quantity':
        quantity.openForRows(plan.targetIds, fanOutName(cluster.name, plan))
        return
      case 'skip':
        acts.skipRows(fanOutName(cluster.name, plan), rows)
        return
      case 'remove':
        await acts.removeRows(fanOutName(cluster.name, plan), rows)
    }
  }

  async function openClusterMenu(cluster: PackingCluster): Promise<void> {
    clusterHold.cancel()
    // A touch hold can fire twice (the timer, then the browser's `contextmenu`).
    if (active) return
    const entries = clusterMenuEntries(clusterInstances(cluster), clusterMenuContext())
    if (entries.length === 0) return

    active = true
    try {
      const sheet = await actionSheetController.create({
        header: cluster.name,
        // The scope, before the actions rather than after them: the head writes
        // several rows, and how many is the part a reader cannot see on a shut
        // cluster.
        subHeader: t('packing.clusterScope', { n: cluster.instanceIds.length }),
        buttons: [
          ...entries.map((action) => ({
            text: t(CLUSTER_MENU_BUTTONS[action].labelKey),
            icon: CLUSTER_MENU_BUTTONS[action].icon,
            role: CLUSTER_MENU_BUTTONS[action].role,
            handler: () => {
              void runClusterMenu(action, cluster)
            },
          })),
          { text: t('common.cancel'), role: 'cancel' },
        ],
      })
      await sheet.present()
      await sheet.onDidDismiss()
    } finally {
      active = false
    }
  }

  return { hold, clusterHold, openRowMenu, openClusterMenu, menuActive }
}
