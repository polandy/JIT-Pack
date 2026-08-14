import { onUnmounted, reactive, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

/**
 * The app-bar actions a page contributes at runtime (ADR-011's "small
 * slot API", G-12's icon cluster).
 *
 * **Data, not a `<Teleport>`.** The first implementation teleported the
 * buttons into a `<span id="header-actions">` inside the header's
 * `ion-buttons`. Ionic's web components relocate slotted DOM after mount,
 * so on a cold boot straight into a drill-down Vue patched a teleported
 * subtree whose container had moved and threw
 * `Cannot read properties of null (reading 'emitsOptions')` mid-patch —
 * which aborts the render. The symptom looked nothing like its cause: the
 * packing list came up empty after a reload and read as *lost data*, when
 * the rows were in IndexedDB and on their way into the store all along.
 *
 * Describing the buttons instead of moving them removes the whole class:
 * the header owns its DOM, and a page only says what should be in it.
 *
 * Keyed by route path for the same reason titles are (see
 * `useHeaderTitle`): Ionic keeps the outgoing page mounted through the
 * transition, so its `onUnmounted` fires after the incoming page has
 * registered, and one shared slot would be wiped by the page that left.
 */
export interface HeaderAction {
  /** Stable within a page; used as the render key and the test id. */
  id: string
  /** An `ionicons` import — the header renders it icon-only. */
  icon: string
  /** Accessible name and tooltip; already translated. */
  label: string
  onClick: () => void
  /** Renders the primary tint, for a control that is currently in force. */
  active?: boolean
  /** Rendered as a badge when > 0 — the FR-25.11a filter count. */
  badge?: number
}

const actions = reactive(new Map<string, HeaderAction[]>())

/** actionsFor returns the actions registered for a path, if any. */
export function actionsFor(path: string): HeaderAction[] {
  return actions.get(path) ?? []
}

/** setActionsFor registers a page's actions. Exported for tests. */
export function setActionsFor(path: string, next: HeaderAction[]): void {
  if (next.length > 0) actions.set(path, next)
  else actions.delete(path)
}

/** clearActionsFor removes one path's actions, leaving every other alone. */
export function clearActionsFor(path: string): void {
  actions.delete(path)
}

/**
 * setHeaderActions registers a reactive action list for the calling page.
 * Pass a getter: the badge and the active state follow the page's own
 * state, and the label follows the locale.
 */
export function setHeaderActions(getter: () => HeaderAction[]): void {
  // Captured at setup, deliberately — see the note in useHeaderTitle.
  const path = useRoute().path
  watchEffect(() => setActionsFor(path, getter()))
  onUnmounted(() => clearActionsFor(path))
}
