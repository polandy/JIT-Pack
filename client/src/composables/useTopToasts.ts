/**
 * The toasts at the top of the screen, presented one at a time (G-23).
 *
 * `lib/toastQueue.ts` decides the order; this is the Ionic half — a toast is
 * "shown" from its presentation until Ionic reports it dismissed, whether by
 * its duration, its button or a swipe.
 */
import type { ToastOptions } from '@ionic/core'

import { WAITING_ATTRIBUTE, createToastQueue } from '@/lib/toastQueue'
import { presentToast } from './shared/toast'

/**
 * How long a top toast stays. Longer than a confirmation's, because each one
 * carries an action somebody has to read and reach.
 */
export const TOP_TOAST_DURATION_MS = 6000

/** One top toast: what Ionic presents, and what follows its dismissal. */
export interface TopToast {
  options: ToastOptions
  /**
   * Runs once the toast has been dismissed — never for one still waiting,
   * which is what keeps a notice nobody saw unread on the server.
   */
  onDismissed?: () => void
}

/**
 * useTopToasts returns the one way into the top of the screen. App.vue calls
 * it once; its notices, sync conflicts and refused changes all share the
 * queue, so none can lie over another.
 */
export function useTopToasts(): { presentTopToast: (toast: TopToast) => void } {
  let onScreen: HTMLIonToastElement | null = null

  const queue = createToastQueue<TopToast>(
    async ({ options, onDismissed }) => {
      let dismissed: Promise<unknown> = Promise.resolve()
      const toast = await presentToast(
        { duration: TOP_TOAST_DURATION_MS, ...options, position: 'top' },
        (created) => {
          dismissed = created.onDidDismiss()
        },
      )
      onScreen = toast
      toast.setAttribute(WAITING_ATTRIBUTE, String(queue.waiting()))
      try {
        await dismissed
      } finally {
        onScreen = null
      }
      onDismissed?.()
    },
    (waiting) => onScreen?.setAttribute(WAITING_ATTRIBUTE, String(waiting)),
  )

  return { presentTopToast: (toast) => queue.enqueue(toast) }
}
