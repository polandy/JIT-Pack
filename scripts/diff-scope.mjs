/**
 * What a diff reaches, for the CI `changes` job (ADR-079).
 *
 * Two answers, both computed from the list of changed paths:
 *
 * - **`app_untouched`** — no path is app input (docs, specs, unit tests, the
 *   gates, the other workflows), so e2e and visual have nothing to find. The
 *   list names what is *not* app input, not what is: a path it does not name
 *   runs the suites, so forgetting to update it costs a run, never a missed
 *   regression. Unit tests are on it because `go` and `client` run them in
 *   every case.
 * - **`module`** — every app-input path lies inside one feature module, so e2e
 *   may run that module's cases and the `@smoke` set instead of the whole
 *   matrix. Empty otherwise. Inside a module means its client directory, its
 *   e2e directory, and its Go files by prefix; everything else — the schema,
 *   the migrations, `wire.go`, `App.vue`, the router, `lib/`, `sync/`, the i18n
 *   catalogues, the lockfile, this workflow — makes it a full run.
 *
 * Usage: `git diff --name-only A B | node scripts/diff-scope.mjs` prints
 * `app_untouched=…` and `module=…`, one per line, ready for `$GITHUB_OUTPUT`.
 * An empty diff is app input, so it runs everything.
 *
 * Node built-ins only: the `changes` job runs it on the bare runner.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { MODULES } from './modules.mjs'

/** Paths no running app is built from. */
const NOT_APP = [
  /\.md$/,
  /^docs\//,
  /^dev-docs\//,
  /^deploy\//,
  /^\.claude\//,
  /^(mkdocs|docker-compose|\.golangci)\.yml$/,
  /^LICENSE/,
  /^(release-please-config|\.release-please-manifest)\.json$/,
  /^\.github\/(dependabot\.yml|workflows\/(docker|docs|release)\.yml)$/,
  /^scripts\/[a-z-]+-gate\.(mjs|sh)$/,
  /^scripts\/ci-remote\.sh$/,
  /^scripts\/[a-z-]+\.test\.mjs$/,
  /^client\/(src|cli)\/(.*\/)?__tests__\//,
  /_test\.go$/,
  /\/testdata\//,
]

/** The paths that belong to one module and to nothing else. */
const modulePaths = (m) => [
  new RegExp(`^client/src/${m}/`),
  new RegExp(`^client/e2e/${m}/`),
  new RegExp(`^internal/(store|api)/${m}[^/]*\\.go$`),
]

/** True when no running app is built from `path`. */
export const isNotApp = (path) => NOT_APP.some((re) => re.test(path))

/**
 * The scope of a diff: whether it touches the app at all, and the one module
 * it stays inside, or `''`.
 */
export function diffScope(paths) {
  const app = paths.filter((p) => !isNotApp(p))
  if (paths.length > 0 && app.length === 0) return { appUntouched: true, module: '' }
  const inside = MODULES.filter((m) => app.every((p) => modulePaths(m).some((re) => re.test(p))))
  return { appUntouched: false, module: app.length > 0 && inside.length === 1 ? inside[0] : '' }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = readFileSync(0, 'utf8')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
  const { appUntouched, module } = diffScope(paths)
  process.stdout.write(`app_untouched=${appUntouched}\nmodule=${module}\n`)
}
