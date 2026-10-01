/**
 * Prints what failed in a CI run, and nothing else.
 *
 * `gh run view --log-failed` is the obvious way to read a red run, and it is
 * mostly not about the failure: a Playwright leg's log is the image pull layer
 * by layer, the step's own script echoed back, and three attachment banners per
 * failed case, with the one assertion that matters somewhere in between. Read
 * by an agent, every one of those lines is paid for, and a red e2e matrix is
 * tens of thousands of them. This keeps the lines that say *what* failed and
 * *where* — the assertion, the source excerpt around it, the test list, a Go
 * `--- FAIL` with its message — capped per job, and says how many it dropped.
 *
 * Usage:
 *   node scripts/ci-failures.mjs              latest failed run of this branch
 *   node scripts/ci-failures.mjs <run-id>     that run
 *   node scripts/ci-failures.mjs --pr <n>     latest failed run of that PR's branch
 *   --lines <n>                               lines kept per job (default 60)
 *
 * The full log stays one command away (`gh run view <id> --log-failed`), and the
 * header names it, for the case this cut gets wrong.
 *
 * Node built-ins and the `gh` CLI only.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Lines per job unless `--lines` says otherwise; a failure's core fits well inside it. */
const DEFAULT_LINES = 60

/**
 * Lines that are never about the failure: image pulls, the step's echoed
 * script and env, group markers, Playwright's attachment banners and trace
 * hints, and the runner's closing exit-code notice.
 */
const NOISE = [
  /: (Pulling fs layer|Waiting|Download complete|Verifying Checksum|Pull complete|Already exists)$/,
  /^(Digest|Status): /,
  /^Unable to find image /,
  /Pulling from /,
  /^##\[(group|endgroup)\]/,
  /^Process completed with exit code/,
  /^\x1b\[36;1m/,
  /^\^\[\[36;1m/,
  /^shell: /,
  /^env:$/,
  /^ {2}[A-Z_]+:( |$)/,
  /attachment #\d+: /,
  /^\s*test-results\//,
  /^\s*Usage:$/,
  /npx playwright show-trace/,
  /^\s*─+$/,
  /^\s*Error Context: /,
  /^\[WebServer\] /,
  /^[·°×±FT]+$/,
]

/**
 * A repeated line shorter than this is kept: blank separators, a bare `|`
 * caret line, a closing brace. Anything longer seen twice in one job is the
 * runner printing the same failure again — Playwright reports each one inline
 * and once more in its closing list.
 */
const REPEAT_MIN = 20

/** A GitHub log line is `job \t step \t timestamp text`; keep the text, drop colour codes. */
export function parse(raw) {
  const jobs = new Map()
  for (const line of raw.split('\n')) {
    const [job, , rest = ''] = line.split('\t')
    if (!job) continue
    const text = rest
      .replace(/^﻿?\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\^\[\[[0-9;]*m/g, '')
      .trimEnd()
    if (!jobs.has(job)) jobs.set(job, [])
    jobs.get(job).push(text)
  }
  return jobs
}

/** The lines worth reading: noise dropped, blank runs and repeats collapsed. */
export function digest(lines) {
  const kept = []
  const seen = new Set()
  for (const raw of lines) {
    const line = raw.replace(/^##\[(error|notice)\]/, '')
    if (NOISE.some((re) => re.test(line))) continue
    if (line === '' && (kept.length === 0 || kept.at(-1) === '')) continue
    if (line.length >= REPEAT_MIN && seen.has(line.trim())) continue
    seen.add(line.trim())
    kept.push(line)
  }
  return kept
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
}

/** The newest failed CI run of a branch. */
function latestFailed(branch) {
  const out = gh([
    'run',
    'list',
    '--branch',
    branch,
    '--status',
    'failure',
    '--limit',
    '1',
    '--json',
    'databaseId',
  ])
  const [run] = JSON.parse(out)
  if (!run) throw new Error(`no failed run on branch ${branch}`)
  return String(run.databaseId)
}

function args(argv) {
  const opts = { run: null, pr: null, lines: DEFAULT_LINES }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pr') opts.pr = argv[++i]
    else if (argv[i] === '--lines') opts.lines = Number(argv[++i])
    else opts.run = argv[i]
  }
  return opts
}

function main() {
  const opts = args(process.argv.slice(2))
  let run = opts.run
  if (!run) {
    const branch = opts.pr
      ? JSON.parse(gh(['pr', 'view', opts.pr, '--json', 'headRefName'])).headRefName
      : execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          encoding: 'utf8',
        }).trim()
    run = latestFailed(branch)
  }

  const jobs = parse(gh(['run', 'view', run, '--log-failed']))
  console.log(
    `run ${run} — ${jobs.size} failed job(s); full log: gh run view ${run} --log-failed\n`,
  )
  for (const [job, lines] of jobs) {
    const kept = digest(lines)
    /*
     * The tail, not the head: a test runner prints its verdict last, and what
     * precedes the cap is the setup the noise filter did not recognise.
     */
    const shown = kept.slice(-opts.lines)
    const dropped = lines.length - shown.length
    console.log(
      `=== ${job} (${shown.length} of ${lines.length} lines${dropped ? `, ${dropped} dropped` : ''})`,
    )
    console.log(shown.join('\n').trim())
    console.log('')
  }
}

/* Run when invoked, not when the test imports the two functions above. */
if (process.argv[1] === fileURLToPath(import.meta.url)) main()
