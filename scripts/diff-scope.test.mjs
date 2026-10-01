// The CI `changes` job's two answers (ADR-079). `node --test scripts/`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diffScope } from './diff-scope.mjs'

const cases = [
  {
    name: 'docs and unit tests alone touch no app input',
    paths: ['dev-docs/PRD_Addendum_v2.10.md', 'client/src/planner/__tests__/store.spec.ts', 'internal/store/planner_test.go'],
    want: { appUntouched: true, module: '' },
  },
  {
    name: 'a diff inside the planner, with its docs and tests, runs the planner alone',
    paths: [
      'client/src/planner/IdeaDetail.vue',
      'client/e2e/planner/ideas.spec.ts',
      'internal/store/planner.go',
      'internal/api/planner.go',
      'dev-docs/UI_Spec_v1.10.md',
      'client/src/planner/__tests__/actions.spec.ts',
    ],
    want: { appUntouched: false, module: 'planner' },
  },
  {
    name: 'a diff inside shopping runs shopping alone',
    paths: ['client/src/shopping/ShoppingPage.vue', 'client/e2e/shopping/single/purchase-stamp.spec.ts'],
    want: { appUntouched: false, module: 'shopping' },
  },
  {
    name: "a change to the planner's words alone runs the planner alone",
    paths: ['client/src/planner/i18n/en.ts', 'client/src/planner/i18n/de.ts', 'client/src/planner/IdeaCard.vue'],
    want: { appUntouched: false, module: 'planner' },
  },
  {
    name: 'two modules at once are a full run',
    paths: ['client/src/planner/IdeaCard.vue', 'client/src/shopping/ShoppingRows.vue'],
    want: { appUntouched: false, module: '' },
  },
  ...[
    'internal/store/schema.sql',
    'internal/store/migrations/011_idea_images.sql',
    'internal/api/wire.go',
    'client/src/App.vue',
    'client/src/router/index.ts',
    'client/src/lib/tripViews.ts',
    'client/src/sync/featureModule.ts',
    'client/src/i18n/messages/de.ts',
    'client/package-lock.json',
    '.github/workflows/ci.yml',
    'client/e2e/helpers/m28.ts',
    'client/e2e/global-nav.spec.ts',
    'scripts/modules.mjs',
    'scripts/diff-scope.mjs',
  ].map((kernel) => ({
    name: `a planner diff that also touches ${kernel} is a full run`,
    paths: ['client/src/planner/IdeaCard.vue', kernel],
    want: { appUntouched: false, module: '' },
  })),
  {
    name: 'a name that merely starts like a module is not inside it',
    paths: ['client/src/plannerExtras/x.ts', 'internal/store/plannerx/y.go'],
    want: { appUntouched: false, module: '' },
  },
  {
    name: 'an empty diff runs everything',
    paths: [],
    want: { appUntouched: false, module: '' },
  },
]

for (const c of cases) {
  test(c.name, () => assert.deepEqual(diffScope(c.paths), c.want))
}
