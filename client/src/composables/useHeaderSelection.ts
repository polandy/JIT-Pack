import { onUnmounted, reactive, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

/**
 * A list's selection, shown in the app bar while it lasts (G-20).
 *
 * The bar that counted the selection used to sit in the page, above the
 * list: entering selection inserted it into the flow and every row under it
 * moved down, so the user lost the row they had just held (owner,
 * 2026-09-24). The app bar is already there and already that tall, so it
 * turns into the selection bar instead — nothing in the page moves.
 *
 * Data, not a teleport, and keyed by route path — both for the reasons
 * `useHeaderActions` gives.
 */
export interface HeaderSelection {
  /** How many are chosen. */
  count: number
  /** How many „Alle" would choose. */
  total: number
  /** The screen's prefix for the test handles, e.g. `m6`. */
  testid: string
  /** Leaves selection. */
  onExit: () => void
  /** Chooses all, or clears when all are chosen. */
  onAll: () => void
}

const selections = reactive(new Map<string, HeaderSelection>())

/** selectionFor returns the selection registered for a path, if one is on. */
export function selectionFor(path: string): HeaderSelection | null {
  return selections.get(path) ?? null
}

/** setSelectionFor registers or clears a page's selection. Exported for tests. */
export function setSelectionFor(path: string, next: HeaderSelection | null): void {
  if (next) selections.set(path, next)
  else selections.delete(path)
}

/**
 * setHeaderSelection registers the calling page's selection. The getter
 * returns `null` while the page is not selecting, which gives the bar back.
 */
export function setHeaderSelection(getter: () => HeaderSelection | null): void {
  // Captured at setup, deliberately — see the note in useHeaderTitle.
  const path = useRoute().path
  watchEffect(() => setSelectionFor(path, getter()))
  onUnmounted(() => setSelectionFor(path, null))
}
