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

// `no-restricted-syntax` takes a single list per file: a later block that
// names the rule replaces an earlier block's list rather than adding to it.
// So every ban is a constant, the blocks below go from the widest file set to
// the narrowest, and each one restates the bans of the wider blocks above it.
const STORES_BY_NAME = [
  {
    selector: "VariableDeclarator[id.name='store'][init.callee.name=/^use.+Store$/]",
    message:
      'Bind a store to its own name (tripStore, masterStore, identityStore), not to `store` — one grep has to find every reader.',
  },
]

const TYPED_INJECTION_KEYS = [
  {
    selector: "CallExpression[callee.name='inject'][arguments.0.type='Literal']",
    message:
      'Inject through an InjectionKey, not a string — see composables/shared/useOrchestrator.ts.',
  },
]

const ONE_CLOCK_IN_THE_SYNC_LAYER = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message:
      "Read the injected clock (SyncContext.nowIso, the orchestrator's `now`) instead of calling Date.now().",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'Read the injected clock (SyncContext.nowIso) instead of constructing a Date from the machine clock.',
  },
]

const NO_REAL_CLOCK_IN_SPECS = [
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message:
      'A spec hands the code a fixed clock (`() => NOW`) — or pins the machine clock with vi.setSystemTime — instead of reading or passing on Date.now.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'A spec writes the instant it means (a literal, or new Date(NOW)) instead of constructing a Date from the machine clock.',
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: 'Date() reads the machine clock; a spec writes the instant it means.',
  },
]

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
    // U-14: a pinia store is bound to its own name, never to `store`. The trip
    // store was `store` in 13 files and `tripStore` in 8, so a grep for
    // `tripStore.getItems` found a third of its readers — and in the packing
    // list `store.` sat beside `masterStore.`, where only the import told you
    // which was which.
    //
    // The rule bans the ambiguous *name* rather than requiring a particular
    // one, because a selector cannot compare the binding to the composable it
    // calls: `master` is unambiguous about which store it is, `store` is not.
    name: 'app/stores-are-bound-to-their-own-name',
    files: ['src/**/*.{ts,vue}', 'e2e/**/*.ts', 'cli/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...STORES_BY_NAME] },
  },

  {
    // C-14: an injection key is a typed `InjectionKey`, never a string. A
    // string key carries no type, so every consumer restates one and asserts
    // away the `undefined` the lookup actually returns — which is how an
    // assertion ends up standing in for a check nobody made.
    //
    // Like the clock rules below, this bans a *shape* rather than naming
    // files: refusing the string is what keeps the key the single place the
    // injected type is written.
    name: 'app/injection-keys-are-typed',
    files: ['src/**/*.{ts,vue}', 'cli/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...STORES_BY_NAME, ...TYPED_INJECTION_KEYS] },
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
      'src/sync/mutations.ts',
      'src/composables/useSyncOrchestrator.ts',
      'src/app/**/*.ts',
      'cli/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...STORES_BY_NAME,
        ...TYPED_INJECTION_KEYS,
        ...ONE_CLOCK_IN_THE_SYNC_LAYER,
      ],
    },
  },

  {
    // A spec reads no real clock either: an assertion that holds only at
    // the moment the suite happens to run is one a rerun can break, and a
    // timestamp from the machine cannot be compared with anything the test
    // wrote. A spec hands the code a fixed clock (`() => NOW`, `isoFrom`), or
    // sets the machine clock with `vi.setSystemTime` when the default itself
    // is under test.
    //
    // Stricter than the sync-layer rule: a spec has no real clock to install,
    // so `Date.now` handed on (`new HLCGenerator(Date.now, …)`) is banned
    // as well as called. `clockSeam.spec.ts` holds the same line for `.vue`.
    name: 'app/no-real-clock-in-specs',
    files: ['src/**/__tests__/**/*.ts', 'cli/**/__tests__/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...STORES_BY_NAME,
        ...TYPED_INJECTION_KEYS,
        ...NO_REAL_CLOCK_IN_SPECS,
      ],
    },
  },

  skipFormatting,
)
