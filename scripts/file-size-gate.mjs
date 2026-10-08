/**
 * A ratchet on the length of source files: none may grow past `LIMIT` lines,
 * and the ones that already have may only shrink.
 *
 * A file that size has stopped being one decision. A screen over a thousand
 * lines is three components and a view model sharing one `<script setup>`,
 * and every change to one of them is read, reviewed and diffed against all
 * of them. Nothing else sees it happen: each PR adds forty lines that belong
 * exactly where they went, and the file is only ever too long in hindsight.
 *
 * The files over the limit today are named in `file-size-budget.txt` with
 * their current length. The gate refuses
 *  - a file over the limit that the budget does not name — split it instead;
 *  - a budgeted file longer than its budget — the budget is not raised;
 *  - a budget above the file's length — lower it to what the file has, so a
 *    split's gain is kept and not spent again by the next PR;
 *  - an entry for a file that is gone or back under the limit — delete it.
 * The budget takes no new entries; a file it does not name stays under the limit.
 *
 * Production source only — the Go packages and `client/src` — because that is
 * what a change has to read. A spec is a list of cases and long by nature, and
 * a generated file (`Do not edit.` in its header, the wiregen output) is as
 * long as the contract it mirrors.
 *
 * Node built-ins only; wired into `make ci` and the CI client job beside the
 * other node gates.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/* Run from the repository root by `make ci`, from `client/` by the CI job. */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')

/** The length past which a file is held to the budget. */
const LIMIT = 800

const BUDGET_FILE = 'scripts/file-size-budget.txt'

/** Each source tree with the files in it the gate measures. */
const TREES = [
  { dir: 'cmd', source: (f) => f.endsWith('.go') && !f.endsWith('_test.go') },
  { dir: 'internal', source: (f) => f.endsWith('.go') && !f.endsWith('_test.go') },
  {
    dir: 'client/src',
    source: (f) =>
      (f.endsWith('.ts') || f.endsWith('.vue')) && !f.endsWith('.spec.ts') && !f.includes('/__tests__/'),
  },
]

/** How far into a file its generated-file header is looked for. */
const HEADER_LINES = 5
const GENERATED = /Do not edit\./

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

/** Lines as `wc -l` counts them: one per newline. */
function lineCount(text) {
  let n = 0
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++
  return n
}

function measure() {
  const sizes = new Map()
  for (const { dir, source } of TREES) {
    for (const path of walk(resolve(root, dir))) {
      const file = relative(root, path).split('\\').join('/')
      if (!source(file)) continue
      const text = readFileSync(path, 'utf8')
      if (GENERATED.test(text.split('\n', HEADER_LINES).join('\n'))) continue
      sizes.set(file, lineCount(text))
    }
  }
  return sizes
}

/** `<lines> <path>` per line; `#` starts a comment. */
function readBudget() {
  const budget = new Map()
  const problems = []
  readFileSync(resolve(root, BUDGET_FILE), 'utf8')
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.replace(/#.*/, '').trim()
      if (!line) return
      const match = /^(\d+)\s+(\S+)$/.exec(line)
      if (!match) problems.push(`${BUDGET_FILE}:${i + 1}: expected "<lines> <path>", got "${raw}"`)
      else budget.set(match[2], Number(match[1]))
    })
  return { budget, problems }
}

const sizes = measure()
const { budget, problems } = readBudget()

for (const [file, lines] of sizes) {
  if (lines <= LIMIT || budget.has(file)) continue
  problems.push(`${file}: ${lines} lines, over the ${LIMIT}-line limit — split it; the budget takes no new entries`)
}
for (const [file, allowed] of budget) {
  const lines = sizes.get(file)
  if (lines === undefined) {
    const why = existsSync(resolve(root, file)) ? 'is not measured source' : 'no longer exists'
    problems.push(`${BUDGET_FILE}: ${file} ${why} — delete its line`)
  } else if (lines <= LIMIT) {
    problems.push(`${BUDGET_FILE}: ${file} is down to ${lines} lines, within the limit — delete its line`)
  } else if (lines > allowed) {
    problems.push(`${file}: ${lines} lines, its budget is ${allowed} — move the growth into a new file`)
  } else if (lines < allowed) {
    problems.push(`${BUDGET_FILE}: ${file} shrank to ${lines} lines — lower its budget from ${allowed} to ${lines}`)
  }
}

if (problems.length > 0) {
  console.error(`file-size gate: ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`file-size gate: ${sizes.size} source files, ${budget.size} held at their budget, every other within ${LIMIT} lines`)
