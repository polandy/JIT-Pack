/**
 * The app's paths, for the suite (T-11).
 *
 * Re-exported from the client rather than copied: 251 `page.goto('/…')`
 * literals meant the suite spelled `/tabs/templates` 51 times against four
 * occurrences in `client/src`, so a renamed route would have been found by
 * a red run rather than by a build. `src/router/paths.ts` is import-free
 * on purpose, so it compiles here without the `@/` alias.
 */
export * from '../src/router/paths'
