/**
 * Toasts, presented in one place (FR-9.4).
 *
 * A bottom toast and the tab bar want the same forty pixels: Ionic anchors
 * `position: 'bottom'` to the bottom of the viewport, and the navigation bar
 * is already there. Measured at 430×932 the toast occupied 876–924 against a
 * bar at 875–932 — the confirmation written across the four tab labels, cut
 * off at the right.
 *
 * Ionic's own answer is `positionAnchor`, which with `position: 'bottom'`
 * puts the toast *above* the named element. Five call sites had found that
 * and passed their screen's FAB; four had not, and those were the defect.
 * Choosing an anchor per screen is what made it possible to forget one, so
 * the choice lives here instead and every call site goes through this module.
 */
import { toastController } from '@ionic/vue'
import type { ToastOptions } from '@ionic/core'

/**
 * The id `TabBar.vue` puts on its `<nav>`, so a toast can be positioned above
 * it. Named once rather than written at both ends (CODING_PRINCIPLES §4a).
 */
export const TAB_BAR_ANCHOR_ID = 'jp-tab-bar'

/**
 * How long a confirmation stays. Fifteen call sites had written `3000` and
 * two views a private `TOAST_MS` of the same value, so the number was a
 * decision nobody could make once. A caller that needs longer — the sync
 * failures in `App.vue`, which carry an action — still names its own.
 */
export const TOAST_DURATION_MS = 3000

/**
 * The bottom navigation, but only while it is actually laid out.
 *
 * Two states have to read as "no bar": M4 is full-screen and does not render
 * it at all, and above 900 px it is `display: none` because G-9 hands the job
 * to the rail. The second is the dangerous one — Ionic measures a hidden
 * anchor as a zeroed box and subtracts a whole viewport height from the
 * offset, which throws the toast off screen entirely. A zero-height bar is
 * therefore no bar, not a bar of height zero.
 */
function laidOutTabBar(): HTMLElement | undefined {
  const nav = document.getElementById(TAB_BAR_ANCHOR_ID)
  return nav && nav.getBoundingClientRect().height > 0 ? nav : undefined
}

/**
 * presentToast creates a toast and presents it, clear of the tab bar.
 *
 * `position` defaults to `'bottom'`, which is what every in-page confirmation
 * uses; a caller that names its own `positionAnchor` keeps it, because a FAB
 * sits higher than the bar and some screens deliberately clear that instead.
 * `duration` defaults the same way, to `TOAST_DURATION_MS`.
 */
export async function presentToast(options: ToastOptions): Promise<HTMLIonToastElement> {
  const position = options.position ?? 'bottom'
  const positionAnchor =
    position === 'bottom' ? (options.positionAnchor ?? laidOutTabBar()) : options.positionAnchor

  const toast = await toastController.create({
    duration: TOAST_DURATION_MS,
    ...options,
    position,
    positionAnchor,
  })
  await toast.present()
  return toast
}
