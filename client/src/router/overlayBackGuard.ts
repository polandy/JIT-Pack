/**
 * Browser-back with an overlay open (ADR-011, M5's sheet).
 *
 * Overlay routes *replace* the history entry of the screen beneath them —
 * deliberately, so Ionic never mounts a twin of that screen (see the
 * trip-detail route; a push measurably mounts a second packing list).
 * The cost: the entry under the overlay is gone, so a history pop skips
 * it and lands two screens back. The chevron already treats "back with
 * an overlay open" as "close the overlay" (backTarget's overlay branch);
 * this guard gives the browser's back button the same meaning.
 *
 * Mechanically the pop is allowed to *complete* and the overlay parent is
 * then pushed — not intercepted in beforeEach: Ionic reads the pending
 * pop direction when a navigation confirms, and a beforeEach redirect
 * leaves that stale info to poison the redirect itself (the wrong screen
 * renders under the right URL). Letting both navigations confirm keeps
 * Ionic coherent, and the corrective push rebuilds the natural
 * list → trip chain, so the *next* back lands where it should.
 */
import type { Router } from 'vue-router'

import { backTarget, type BackTargetRoute } from './backTarget'

/** installOverlayBackGuard wires the guard into the given router. */
export function installOverlayBackGuard(router: Router): void {
  let poppedBack = false

  // The listener runs synchronously on the history event; afterEach runs
  // later in the navigation's microtask chain, so the flag is always set
  // by the time it is read.
  router.options.history.listen((_to, _from, info) => {
    poppedBack = info.type === 'pop' && info.direction === 'back'
  })

  router.afterEach((to, from, failure) => {
    const wasPop = poppedBack
    poppedBack = false
    if (!wasPop || failure) return

    const overlay = from.meta.overlayParam
    if (!overlay || !from.params[overlay] || !from.meta.overlayParent) return

    const target = backTarget(from as BackTargetRoute)
    if (!target || to.path === target) return
    router.push(target)
  })
}
