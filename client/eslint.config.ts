import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  // Build and test *output*, not source. playwright-report and
  // test-results are git-ignored but eslint knew nothing about them,
  // so a local e2e run followed by `npm run lint` reported ~80 errors
  // from Playwright's own bundled report assets.
  globalIgnores([
    '**/dist/**',
    '**/dist-ssr/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
  ]),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  {
    name: 'app/rule-overrides',
    rules: {
      // Ionic components are web components: they need the native `slot`
      // attribute, and this rule's autofix (v-slot) would break them.
      'vue/no-deprecated-slot-attribute': 'off',
      // `const { key: _dropped, ...rest } = obj` is the idiomatic way to
      // remove a key immutably; the rest-sibling discard is intentional.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  {
    // C-5: the sync layer reads the clock it was given, never the machine's.
    // Scoped to the files that stamp a *row* — a screen showing the current
    // time reads no row and nothing asserts it, so it is deliberately out.
    //
    // The rule bans the *call*, not the identifier: `config.now ?? Date.now`
    // hands the real clock to the one place that installs it, and that is
    // the shape the orchestrator uses. Same distinction as the Go guard in
    // internal/store (G-4) — a rule rather than a list of excused files.
    name: 'app/one-clock-in-the-sync-layer',
    files: [
      'src/composables/useMutations.ts',
      'src/composables/useSyncOrchestrator.ts',
      'src/composables/sync/**/*.ts',
      'cli/**/*.ts',
    ],
    ignores: ['src/composables/sync/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'Read the injected clock (SyncContext.nowIso, the orchestrator\'s `now`) instead of calling Date.now().',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Read the injected clock (SyncContext.nowIso) instead of constructing a Date from the machine clock.',
        },
      ],
    },
  },

  skipFormatting,
)
