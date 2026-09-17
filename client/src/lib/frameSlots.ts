/**
 * The ids of the frame's own slots, which a screen fills from a distance.
 *
 * Today there is one: the detail pane's host (G-9, ADR-064). `App.vue`
 * renders the element, a screen teleports its pane into it, and the
 * Playwright suite scopes to it — three files comparing one literal, which
 * is the shape CODING_PRINCIPLES §4a names.
 *
 * Deliberately free of imports, Vue included, so the suite can re-export it
 * rather than keep a fourth copy — the same arrangement `lib/fabAnchors.ts`
 * explains at greater length.
 */

/** The frame's detail-pane host. Holds at most one pane; empty, it takes no width. */
export const PANEL_HOST_ID = 'app-panel-host'

/** The same id as a selector, for a teleport target and for a test scope. */
export const PANEL_HOST_SELECTOR = `#${PANEL_HOST_ID}`
