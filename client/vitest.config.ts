import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // A DOM is the exception here, not the rule: most specs are pure logic,
      // and building a jsdom window costs ~1.5 s per file whether or not the
      // file uses it. A spec that needs one asks with a `@vitest-environment
      // jsdom` docblock.
      //
      // Add the docblock whenever the spec's subject touches `localStorage`,
      // `document` or `window` — **even if the suite passes without it**. A
      // missing docblock is not reliably a red test: code that reads a DOM
      // global inside a `try` takes the `catch` under `node` and the spec goes
      // green against the wrong branch. The check that catches that is a
      // coverage diff between the two environments; see the implementation log,
      // "Every spec paid for a DOM, and one of them was green for the wrong
      // reason".
      environment: 'node',
      // A `vi.stubGlobal` inside one test must not outlive it. Without this
      // it does, and the leak stays latent for as long as a `beforeEach`
      // happens to install a fresh stub over it — so no case is wrong today,
      // and the first spec to *stop* stubbing in `beforeEach` inherits five
      // failures it did not cause. `ids.spec.ts` had already bought itself
      // out with its own `vi.unstubAllGlobals()`; this is that, for every
      // file, so the protection is not per-author.
      unstubGlobals: true,
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
