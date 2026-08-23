import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // A DOM is the exception here, not the rule: most specs are pure logic
      // (`src/domain` by invariant 4, the stores, the sync layer), and building
      // a jsdom window costs ~1.5 s per file whether or not the file touches it.
      // A spec that needs one asks with a `@vitest-environment jsdom` docblock.
      //
      // The trap this leaves behind, and it is not hypothetical: production code
      // that reads a DOM global inside a `try`/`catch` — `useInventoryProperties`
      // does — does not fail under `node`, it takes the `catch`. The spec stays
      // green while exercising the error path instead of the read path. A missing
      // docblock is therefore *not* reliably a red test, so when a spec's subject
      // touches `localStorage`, `document` or `window`, add the docblock even if
      // the suite passes without it. The check that catches this is a coverage
      // diff between the two environments, not the suite itself.
      environment: 'node',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
