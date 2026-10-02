/**
 * The legs of the CI `e2e` job (ADR-091), computed by the `changes` job from
 * the event and the module `diff-scope.mjs` found.
 *
 * Each browser is sharded on its own axis, because a WebKit test costs more
 * than its Chromium twin and a count-split across both put the slow half on
 * the last legs. And a pull request runs WebKit only on the cases that can
 * tell the engines apart — `@smoke` and `@webkit` — while a push to main runs
 * every case in both, so a WebKit-only regression surfaces on main, one merge
 * late, never not at all.
 *
 * The leg counts are measurements, not constants: re-read them against the
 * per-leg times of a recent run when the suite grows (CLAUDE.md). A pull
 * request's floor is `e2e-server`, which does not shard; Chromium legs beyond
 * what reaches it buy nothing.
 *
 * Usage: `node scripts/e2e-matrix.mjs <event> [module]` prints
 * `e2e_matrix=<json>` for `$GITHUB_OUTPUT`. Node built-ins only: the
 * `changes` job runs it on the bare runner.
 */
import { fileURLToPath } from 'node:url'

/** Chromium legs on a pull request: sized to land under `e2e-server`. */
export const PR_CHROMIUM_LEGS = 6

/** Legs per browser on a push to main, the full run in both engines. */
export const MAIN_LEGS = { chromium: 4, webkit: 6 }

/** What WebKit runs on a pull request: the floor, and the engine's own cases. */
export const WEBKIT_PR_GREP = '@smoke|@webkit'

/** `of` legs of one browser, each a `--shard`. */
const sharded = (project, of, grep = '') =>
  Array.from({ length: of }, (_, i) => ({
    id: `${project}-${i + 1}`,
    projects: project,
    shard: i + 1,
    of,
    grep,
  }))

/**
 * The legs for one run. A module-only pull request keeps ADR-079's single leg
 * over both engines; anything else is sharded per browser.
 *
 * @param {string} event `github.event_name`
 * @param {string} module what `diff-scope.mjs` answered, '' for none
 * @returns {{ include: Array<{ id: string, projects: string, shard: number, of: number, grep: string }> }}
 */
export function e2eMatrix(event, module) {
  if (event === 'pull_request' && module) {
    return {
      include: [{ id: module, projects: 'chromium webkit', shard: 1, of: 1, grep: `@${module}|@smoke` }],
    }
  }
  if (event === 'pull_request') {
    return {
      include: [
        ...sharded('chromium', PR_CHROMIUM_LEGS),
        { id: 'webkit-subset', projects: 'webkit', shard: 1, of: 1, grep: WEBKIT_PR_GREP },
      ],
    }
  }
  return {
    include: [...sharded('chromium', MAIN_LEGS.chromium), ...sharded('webkit', MAIN_LEGS.webkit)],
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [event = '', module = ''] = process.argv.slice(2)
  process.stdout.write(`e2e_matrix=${JSON.stringify(e2eMatrix(event, module))}\n`)
}
