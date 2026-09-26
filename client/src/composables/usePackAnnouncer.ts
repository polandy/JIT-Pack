import { onUnmounted, ref, type Ref } from 'vue'
import { toastController } from '@ionic/vue'

import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { TOAST_DURATION_MS } from '@/lib/toast'

import { useRowUndo, type RowUndo } from './useRowUndo'

export interface PackAnnouncer {
  /**
   * The undo the snackbar offers. Exposed rather than wrapped: what a pack
   * and a skip write back differs, so each caller still passes its own
   * `restore` — see `useRowUndo`.
   */
  rowUndo: RowUndo
  /**
   * How many packs have been announced on this screen. Rendered onto the
   * content element as `data-pack-announcements`.
   *
   * It exists for the rules that are an *absence* — a snackbar that must not
   * appear (the screen was left while it was being created; until FR-25.31, an
   * un-pack). Checking for "no toast" straight after the act proves nothing —
   * the toast is created asynchronously, so the assertion simply arrives first
   * and passes on a page that was about to show one. It did exactly that, on
   * the build with the guard removed.
   *
   * A counter that only ever goes up turns the absence into a comparison
   * against a number, which is the same reasoning that gave the G-2 indicator
   * its in-flight signal.
   */
  packAnnouncements: Ref<number>
  /** FR-25.2: a pack registers, and the snackbar is where it can be taken back. */
  announcePacked: (name: string) => Promise<void>
  /**
   * FR-5.5 with FR-20.2: the companions that went along are named, because a
   * list that shortened itself by three rows on one tap owes an explanation.
   */
  announceSkipped: (name: string, companions: string[]) => Promise<void>
  /**
   * FR-5.8: an untouched row went off the list. The same snackbar and the
   * same undo as a pack, because it is the same kind of mistap to recover —
   * the row is gone from under the finger that removed it. `leavesItem` says
   * the inventory item goes too once the snackbar does (ADR-065): the undo
   * covers that as well, so the snackbar is where it has to be said.
   */
  announceRemoved: (name: string, leavesItem?: boolean) => Promise<void>
  /**
   * FR-27.16: names taken over from the inventory. The same snackbar, because
   * several rows changing name at once is exactly what a mistap on „Alle"
   * would do, and the undo is how it is taken back.
   */
  announceRenamed: (count: number) => Promise<void>
  /**
   * FR-7.3/FR-7.4: a task was ticked off. It leaves M4's open list the way a
   * packed row leaves the packing list, so the mistap costs the same and is
   * taken back the same way.
   */
  announceTaskDone: (body: string) => Promise<void>
  /**
   * FR-25.31: every other act on the list — the caller has already said, in
   * `message`, what happened. The same snackbar and the same one undo, so a
   * mistap is taken back the same way whichever control it landed on.
   */
  announceAct: (message: string) => Promise<void>
}

/**
 * M4's pack snackbar: one at a time, each armed with the undo for the action
 * that raised it, and none at all once the screen is gone.
 *
 * A composable rather than a block in the screen because the two rules worth
 * testing here are both invisible from the outside — the ordering that keeps a
 * second pack's undo armed, and the guard that drops a snackbar whose screen
 * has been left. From here the second is one unmount away.
 */
export function usePackAnnouncer(anchor: string | null = FAB_ANCHOR.m4): PackAnnouncer {
  const rowUndo = useRowUndo()
  const packAnnouncements = ref(0)

  /** The snackbar currently on screen, so a second action replaces it. */
  let packToast: HTMLIonToastElement | null = null

  /**
   * False once the screen is gone. `toastController.create` is awaited, and
   * tapping back inside that window would otherwise present the snackbar over
   * whatever screen came next — with an undo for a trip the user has left.
   */
  let live = true

  async function announcePacked(name: string): Promise<void> {
    await announce(t('packing.packedToast', { name }))
  }

  async function announceSkipped(name: string, companions: string[]): Promise<void> {
    await announce(
      companions.length > 0
        ? t('packing.skippedToastWith', { name, companions: companions.join(', ') })
        : t('packing.skippedToast', { name }),
    )
  }

  async function announceRemoved(name: string, leavesItem = false): Promise<void> {
    await announce(
      t(leavesItem ? 'packing.removedToastInventory' : 'packing.removedToast', { name }),
    )
  }

  async function announceRenamed(count: number): Promise<void> {
    await announce(t('inventoryNames.adopted', { n: count }))
  }

  async function announceTaskDone(body: string): Promise<void> {
    await announce(t('packing.taskDoneToast', { body }))
  }

  async function announce(message: string): Promise<void> {
    // Cleared *before* dismissing, not after. The dismiss handler below
    // disarms the undo, and an outgoing toast resolves its dismissal after
    // the incoming one has already armed a new record — so with the order
    // reversed, packing two rows in a row left the second with no undo at
    // all. Nulling first makes the outgoing handler's identity check fail,
    // which is exactly what it is for.
    const outgoing = packToast
    packToast = null
    void outgoing?.dismiss()

    // The one place that does not go through `presentToast`: the order below is
    // load-bearing — created, checked against `live`, armed with its dismiss
    // handler, and only then presented. A helper that presents on creation would
    // put the snackbar on screen before the check that decides it must not be.
    const toast = await toastController.create({
      message,
      // Named rather than defaulted: this is the one toast that does not go
      // through `presentToast`, so nothing else would give it a lifetime —
      // and a snackbar with none sits over the row menu until the page moves.
      duration: TOAST_DURATION_MS,
      position: 'bottom',
      // Above the FAB rather than behind it — see the anchor's own note. The
      // screen names its own: M25 has no FAB, and an anchor that is not on
      // the page leaves Ionic positioning the snackbar off the viewport,
      // where its *Rückgängig* cannot be reached (found by E2E-M25-02).
      positionAnchor: anchor ?? undefined,
      cssClass: 'pack-toast',
      buttons: [{ text: t('packing.undo'), handler: () => rowUndo.undo() }],
    })
    if (!live) {
      void toast.dismiss()
      return
    }
    packToast = toast
    packAnnouncements.value += 1
    // The undo outlives the snackbar only by its dismiss animation; disarming
    // on dismiss is what keeps a stale record from being applied later.
    void toast.onDidDismiss().then(() => {
      if (packToast === toast) {
        packToast = null
        rowUndo.clear()
      }
    })
    await toast.present()
  }

  onUnmounted(() => {
    live = false
    rowUndo.clear()
    void packToast?.dismiss()
  })

  return {
    rowUndo,
    packAnnouncements,
    announcePacked,
    announceSkipped,
    announceRemoved,
    announceRenamed,
    announceTaskDone,
    announceAct: announce,
  }
}
