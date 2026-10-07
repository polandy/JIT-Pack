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
/**
 * One run of a meta line that is more than a sentence — M1's due line, whose
 * counts lead to their blocks (FR-7.11, FR-30.10). A run with `act` is
 * tappable; a `late` one is set in the overdue tone, as a *Überfällig* badge
 * is.
 */
export interface HeadMetaPart {
  text: string
  act?: () => void
  late?: boolean
  testid?: string
}

/** The line under a page's name: a sentence, or runs of one. */
export type HeadMeta = string | readonly HeadMetaPart[]

export interface PageHeadEntry {
  /** The screen's name, in the display face. */
  title: string
  /** The line under it — the trip a sub-screen belongs to, a wizard's step, what is due. */
  meta: HeadMeta | null
  /**
   * Whether the head is yielding its space to the content under it.
   *
   * A screen whose whole job is a long list drives this from its own scroll
   * (M4). It lives on the entry rather than in the page, because since
   * ADR-050 the element is the frame's — held in the page, the rule that
   * scrolling down takes the trip's name with the line under it would not
   * reach the name at all.
   */
  collapsed: boolean
}

const heads = reactive(new Map<string, PageHeadEntry>())

/** headFor returns the head registered for a path, if any. */
export function headFor(path: string): PageHeadEntry | null {
  return heads.get(path) ?? null
}

/** setHeadFor registers a page's head. Exported for tests and the composable. */
export function setHeadFor(
  path: string,
  title: string | null,
  meta: HeadMeta | null,
  collapsed = false,
): void {
  if (title) heads.set(path, { title, meta, collapsed })
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
  meta?: () => HeadMeta | null | undefined,
  collapsed?: () => boolean,
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
  watchEffect(() => setHeadFor(path, title() || null, metaOrNull(meta?.()), collapsed?.() ?? false))
  onUnmounted(() => clearHeadFor(path))
}

/** An empty line — no text, no runs — is no line, so the head draws no element for it. */
function metaOrNull(meta: HeadMeta | null | undefined): HeadMeta | null {
  return meta && meta.length > 0 ? meta : null
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
  return titleKey ? { title: t(titleKey), meta: null, collapsed: false } : null
}
