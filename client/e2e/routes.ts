/**
 * The app's paths, for the suite (T-11).
 *
 * Re-exported from the client rather than copied: with literal
 * `page.goto('/…')` paths the suite would spell `/tabs/templates` dozens of
 * times against a handful in `client/src`, so a renamed route would be found
 * by a red run rather than by a build. `src/router/paths.ts` is import-free
 * on purpose, so it compiles here without the `@/` alias.
 */
export * from '../src/router/paths'
