/**
 * Holds the developer documentation to a line width a reader and a tool can
 * both work with.
 *
 * These files are written one paragraph per physical line, and they had grown
 * to 7 000–8 400 characters on the longest of them. Nothing was wrong with the
 * Markdown: it renders identically either way, which is exactly why it drifted
 * for a year. What breaks is every way the files are actually read — `grep -n`
 * for one FR returns a whole screen of unrelated rules, a partial read cannot
 * land on a single sentence, and a diff of a two-word amendment is a diff of
 * the entire section (T-12, design review 2026-09-02).
 *
 * Three shapes are exempt because wrapping them would change what they mean,
 * not how they look: a Markdown **table row** and an **ATX heading** are each
 * one line by definition, and a fenced code block's line breaks are content. A
 * line with no space left to break on — one long URL or identifier — is over
 * the limit for a reason no author can fix, so it is reported only when a
 * break point exists.
 *
 * Width is counted in **code points**, not UTF-16 units: an emoji is one
 * character to the author who typed it, and `String.length` would call the
 * same line two characters longer than the editor does.
 *
 * Node built-ins only, so it needs no install; wired into `make ci` and the CI
 * client job beside the other node gates.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* Run from the repository root by `make ci`, from `client/` by the CI job. */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')

/** Where the developer documentation lives; every `.md` under it is covered. */
const DOCS_ROOT = 'dev-docs'

/**
 * The two append-only ledgers, and the only exception to the rule above. Their
 * sections are history: rewrapping a line rewrites who wrote it, and `git
 * blame` on an entry is how a decision is traced back to the work that made
 * it. They are also the two files nobody reads end to end — each opens with an
 * index that is read instead of the body, which is the very structure the
 * width is trying to give the others.
 */
const LEDGERS = new Set(['implementation-log.md', 'e2e-tests.md'])

/** Every covered document, in a stable order so a failure reads the same twice. */
function documents() {
  return readdirSync(resolve(root, DOCS_ROOT), { recursive: true, encoding: 'utf8' })
    .map((entry) => entry.replaceAll('\\', '/'))
    .filter((entry) => entry.endsWith('.md') && !LEDGERS.has(entry))
    .sort()
    .map((entry) => `${DOCS_ROOT}/${entry}`)
}

const MAX_WIDTH = 120

/** Width as an author counts it: one emoji is one character. */
function width(line) {
  return [...line].length
}

/** A line this gate cannot ask an author to wrap. */
function exempt(line, inFence) {
  if (inFence) return true
  const stripped = line.trimStart()
  if (stripped.startsWith('|') || stripped.startsWith('#')) return true
  // Nothing to break on before the limit: one unbreakable token.
  return ![...line].slice(0, MAX_WIDTH + 1).includes(' ')
}

const paths = documents()
if (paths.length === 0) throw new Error(`spec-width-gate: no documents under ${DOCS_ROOT}/`)

const offenders = []
for (const path of paths) {
  const lines = readFileSync(resolve(root, path), 'utf8').split('\n')
  let inFence = false
  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      return
    }
    if (width(line) <= MAX_WIDTH || exempt(line, inFence)) return
    offenders.push(`${path}:${index + 1} — ${width(line)} chars`)
  })
}

if (offenders.length > 0) {
  console.error(
    `spec-width-gate: ${offenders.length} line(s) over ${MAX_WIDTH} characters.\n` +
      'Rewrap the paragraph; the width is what makes grep and a partial read usable (T-12).\n',
  )
  for (const offender of offenders.slice(0, 40)) console.error(`  ${offender}`)
  if (offenders.length > 40) console.error(`  … and ${offenders.length - 40} more`)
  process.exit(1)
}

console.log(
  `spec-width-gate: ok — ${paths.length} documents under ${DOCS_ROOT}/, every prose line within ${MAX_WIDTH} characters`,
)
