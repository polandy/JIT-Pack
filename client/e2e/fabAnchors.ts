/**
 * The screens' FAB anchor ids, for the suite (U-12).
 *
 * Re-exported from the client rather than copied, for the reason `routes.ts`
 * gives: two cases assert that the fab *container* survives while its button
 * is hidden, and a renamed id would have left both green against a screen
 * that no longer anchors its snackbar. `src/lib/fabAnchors.ts` is import-free
 * on purpose, so it compiles here without the `@/` alias.
 */
export * from '../src/lib/fabAnchors'
