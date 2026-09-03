import { onUnmounted, ref, type Ref } from 'vue'
import { toastController } from '@ionic/vue'

import { t } from '@/i18n'
import { TOAST_DURATION_MS } from '@/lib/toast'

import { useRowUndo, type RowUndo } from './useRowUndo'

/**
 * The FAB M4's snackbars sit above, named once because two files need it:
 * this module anchors the pack snackbar, and the screen puts the id on the
 * element (CODING_PRINCIPLES §4a). A bottom toast and the FAB want the same
 * corner — see `lib/toast.ts` for why an anchor is chosen at all.
 */
export const M4_FAB_ANCHOR_ID = 'm4-fab-anchor'

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
   * It exists because one of FR-25.2's rules is an *absence*: un-packing a
   * revealed row must not announce anything. Checking for "no toast" straight
   * after the tap proves nothing — the toast is created asynchronously, so the
   * assertion simply arrives first and passes on a page that was about to show
   * one. It did exactly that, on the build with the guard removed.
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
}

/**
 * M4's pack snackbar: one at a time, each armed with the undo for the action
 * that raised it, and none at all once the screen is gone.
 *
 * A composable rather than a block in the screen because the two rules worth
 * testing here are both invisible from the outside — the ordering that keeps a
 * second pack's undo armed, and the guard that drops a snackbar whose screen
 * has been left. The second had been marked untestable while it lived in the
 * view; from here it is one unmount away.
 */
export function usePackAnnouncer(): PackAnnouncer {
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
      // Above the FAB rather than behind it — see the anchor's own note.
      positionAnchor: M4_FAB_ANCHOR_ID,
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

  return { rowUndo, packAnnouncements, announcePacked, announceSkipped }
}
