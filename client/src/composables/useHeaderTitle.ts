import { onUnmounted, reactive, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

/**
 * The header title a page contributes at runtime (ADR-011).
 *
 * `meta.title` covers the static cases straight from the route table.
 * This exists for the ones only known once data has loaded — "Shopping ·
 * Samedan 2026".
 *
 * Titles are keyed by route path rather than held in one shared ref,
 * because Ionic keeps the outgoing page mounted through the transition:
 * its `onUnmounted` fires *after* the incoming page has set its title,
 * and a single slot would be wiped by the page that just left. Keying
 * makes the outcome independent of that ordering instead of racing it.
 */
const titles = reactive(new Map<string, string>())

/** titleFor returns the title registered for a path, if any. */
export function titleFor(path: string): string | null {
  return titles.get(path) ?? null
}

/** setTitleFor registers a title. Exported for tests and the composable. */
export function setTitleFor(path: string, title: string | null): void {
  if (title) titles.set(path, title)
  else titles.delete(path)
}

/** clearTitleFor removes one path's title, leaving every other alone. */
export function clearTitleFor(path: string): void {
  titles.delete(path)
}

/**
 * setHeaderTitle registers a reactive title for the calling page. Pass a
 * getter so the title follows its data — the trip name arrives after the
 * first render.
 */
export function setHeaderTitle(getter: () => string | null | undefined): void {
  // The path is captured once, at setup, deliberately. `useRoute()`
  // returns the *global* reactive route, so reading it inside the effect
  // makes every still-mounted page re-register under whatever path the
  // app navigated to — Ionic keeps the outgoing page alive, so that
  // clobbers the incoming title and was measurably flaky.
  //
  // The cost: if vue-router ever reuses this component for a different
  // param, the title stays keyed to the path the user left and the
  // header falls back to `meta.title`. That degrades to a generic title,
  // never a wrong one, and no route reaches a sibling directly today.
  const path = useRoute().path
  watchEffect(() => setTitleFor(path, getter() || null))
  onUnmounted(() => clearTitleFor(path))
}
