/**
 * Holds the specification documents to a line width a reader and a tool can
 * both work with.
 *
 * These four files are written one paragraph per physical line, and they had
 * grown to 7 000–8 400 characters on the longest of them. Nothing was wrong
 * with the Markdown: it renders identically either way, which is exactly why
 * it drifted for a year. What breaks is every way the files are actually
 * read — `grep -n` for one FR returns a whole screen of unrelated rules, a
 * partial read cannot land on a single sentence, and a diff of a two-word
 * amendment is a diff of the entire section (T-12, design review 2026-09-02).
 *
 * Two shapes are exempt because wrapping them would change what they mean, not
 * how they look: a Markdown **table row** is one line by definition, and a
 * fenced code block's line breaks are content. A line with no space left to
 * break on — one long URL or identifier — is over the limit for a reason no
 * author can fix, so it is reported only when a break point exists.
 *
 * Width is counted in **code points**, not UTF-16 units: an emoji is one
 * character to the author who typed it, and `String.length` would call the
 * same line two characters longer than the editor does.
 *
 * Node built-ins only, so it needs no install; wired into `make ci` and the CI
 * client job beside the other node gates.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* Run from the repository root by `make ci`, from `client/` by the CI job. */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')

/**
 * The specification documents. The two append-only ledgers
 * (`implementation-log.md`, `e2e-tests.md`) are deliberately absent: their
 * sections are history, and rewrapping a line rewrites who wrote it.
 */
const DOCUMENTS = [
  'dev-docs/PRD_Addendum_v2.10.md',
  'dev-docs/UI_Spec_v1.10.md',
  'dev-docs/UI_Test_Spec_v1.0.md',
  'dev-docs/Sync_API_Spec_v1.3.md',
]

const MAX_WIDTH = 120

/** Width as an author counts it: one emoji is one character. */
function width(line) {
  return [...line].length
}

/** A line this gate cannot ask an author to wrap. */
function exempt(line, inFence) {
  if (inFence) return true
  const stripped = line.trimStart()
  if (stripped.startsWith('|')) return true
  // Nothing to break on before the limit: one unbreakable token.
  return ![...line].slice(0, MAX_WIDTH + 1).includes(' ')
}

const offenders = []
for (const path of DOCUMENTS) {
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
  `spec-width-gate: ok — ${DOCUMENTS.length} specification documents, every prose line within ${MAX_WIDTH} characters`,
)
