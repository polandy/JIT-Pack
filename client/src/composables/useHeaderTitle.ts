import { onUnmounted, reactive, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '@/i18n'
import type { MessageKey } from '@/i18n'

/**
 * The head a page contributes at runtime (ADR-011, ADR-050).
 *
 * `meta.titleKey` covers the static cases straight from the route table.
 * This exists for the ones only known once data has loaded — a trip's name.
 *
 * Heads are keyed by route path rather than held in one shared ref,
 * because Ionic keeps the outgoing page mounted through the transition:
 * its `onUnmounted` fires *after* the incoming page has set its head, and
 * a single slot would be wiped by the page that just left. Keying makes
 * the outcome independent of that ordering instead of racing it.
 */
export interface PageHeadEntry {
  /** The screen's name, in the display face. */
  title: string
  /** The line under it — the trip a sub-screen belongs to, a wizard's step. */
  meta: string | null
}

const heads = reactive(new Map<string, PageHeadEntry>())

/** headFor returns the head registered for a path, if any. */
export function headFor(path: string): PageHeadEntry | null {
  return heads.get(path) ?? null
}

/** setHeadFor registers a page's head. Exported for tests and the composable. */
export function setHeadFor(path: string, title: string | null, meta: string | null): void {
  if (title) heads.set(path, { title, meta })
  else heads.delete(path)
}

/** clearHeadFor removes one path's head, leaving every other alone. */
export function clearHeadFor(path: string): void {
  heads.delete(path)
}

/**
 * setHeaderTitle registers a reactive head for the calling page. Pass
 * getters so the head follows its data — the trip name arrives after the
 * first render.
 *
 * The second getter is the meta line, and it is why this takes two
 * arguments rather than one composed string: four screens had written
 * `${t('…')} · ${trip.name}` by hand, each with its own separator, and a
 * title that is really two things cannot be set at two sizes.
 */
export function setHeaderTitle(
  title: () => string | null | undefined,
  meta?: () => string | null | undefined,
): void {
  // The path is captured once, at setup, deliberately. `useRoute()`
  // returns the *global* reactive route, so reading it inside the effect
  // makes every still-mounted page re-register under whatever path the
  // app navigated to — Ionic keeps the outgoing page alive, so that
  // clobbers the incoming head and was measurably flaky.
  //
  // The cost: if vue-router ever reuses this component for a different
  // param, the head stays keyed to the path the user left and the frame
  // falls back to `meta.titleKey`. That degrades to a generic title,
  // never a wrong one, and no route reaches a sibling directly today.
  const path = useRoute().path
  watchEffect(() => setHeadFor(path, title() || null, meta?.() || null))
  onUnmounted(() => clearHeadFor(path))
}

/**
 * resolveHead answers what the frame should render for a path: the head the
 * page registered, else the static title from the route table, else nothing.
 *
 * It lives here rather than in `App.vue` so the fallback is stated once —
 * the header bar reads the same answer to decide whether the screen has a
 * name at all.
 */
export function resolveHead(path: string, titleKey?: MessageKey): PageHeadEntry | null {
  const registered = headFor(path)
  if (registered) return registered
  return titleKey ? { title: t(titleKey), meta: null } : null
}
