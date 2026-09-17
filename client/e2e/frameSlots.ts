/**
 * The frame's slot ids, for the suite.
 *
 * Re-exported from the client rather than copied, for the reason
 * `fabAnchors.ts` gives: the detail pane lives outside the screen since
 * ADR-064, so a renamed host would leave every case that scopes to it green
 * against a pane nothing can find. `src/lib/frameSlots.ts` is import-free on
 * purpose, so it compiles here without the `@/` alias.
 */
export * from '../src/lib/frameSlots'
