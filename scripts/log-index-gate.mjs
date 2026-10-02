/**
 * Holds a document's index against the document itself: every section has an
 * index line, and every index line points at a section that exists.
 *
 * The two append-only ledgers — `dev-docs/implementation-log/` and
 * `dev-docs/e2e-ledger/` — are one file per week or month, each opening with
 * the index of its own sections. The index is meant to be read *instead of*
 * the file, so that a reader can tell in one screen whether anything in there
 * concerns them. That only works while it is complete: an appended section
 * with no index line is invisible to exactly the reader the index was written
 * for, and it fails silently, because both files stay perfectly valid
 * Markdown. The same failure the sibling gates were written for — a claim a
 * document makes about itself that nothing checks.
 *
 * The same holds one level up for every document split into a directory:
 * its README's table is how a reader finds the file, so a file the README
 * does not name is unreachable in the same way.
 *
 * Node built-ins only, so it needs no install; wired into `make ci` and the CI
 * client job beside the other two node gates.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * `make ci` runs this from the repository root and the CI client job runs it
 * from `client/`. Both sibling gates settle that with this line, so this one
 * does too rather than inventing a third convention.
 */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')

/** The ledgers whose dated files each carry an index. */
const LEDGERS = ['dev-docs/implementation-log', 'dev-docs/e2e-ledger']

/** A ledger's dated file: `2026-09-28.md` (a week) or `2026-09.md` (a month). */
const DATED = /^\d{4}-\d{2}(-\d{2})?\.md$/

/** Every document split into a directory whose README names each of its files. */
const SPLIT = [...LEDGERS, 'dev-docs/prd-addendum', 'dev-docs/ui-spec', 'dev-docs/ui-test-spec']

/** Every file that claims to have an index. */
const DOCUMENTS = LEDGERS.flatMap((dir) =>
  readdirSync(resolve(root, dir))
    .filter((name) => DATED.test(name))
    .sort()
    .map((name) => ({ path: `${dir}/${name}`, preamble: [] })),
)

/** The heading whose body holds the index lines, in every document. */
const INDEX_HEADING = '## Index'

/**
 * How long an index line's hook — the part after the em dash — may be.
 *
 * The index is read *instead of* the document, which only works while it can
 * be scanned. It had reached 216 lines with a median hook of 205 characters
 * and a longest of 574: ten pages of prose in front of a file whose whole
 * point was that you would not have to read it. The hook says what you would
 * come looking for; the section says what was found.
 */
const HOOK_LIMIT = 120

/**
 * GitHub's heading-anchor rules: lowercase, drop everything that is not a
 * letter, digit, space or hyphen, spaces to hyphens, and number repeats from
 * the second occurrence on.
 */
function anchorsOf(lines) {
  const used = new Map()
  const anchors = []
  for (const line of lines) {
    const heading = /^(#{2,3}) (.*)$/.exec(line)
    if (!heading) continue
    const title = heading[2]
    let anchor = title
      .toLowerCase()
      .replace(/[^\p{L}\p{N} -]/gu, '')
      .trim()
      .replace(/ /g, '-')
    const seen = used.get(anchor)
    used.set(anchor, seen === undefined ? 0 : seen + 1)
    if (seen !== undefined) anchor = `${anchor}-${seen + 1}`
    anchors.push({ title, anchor })
  }
  return anchors
}

/**
 * Checks one document. Returns the number of indexed sections, or null when the
 * document and its index disagree — the disagreement is reported as it is found.
 */
function check({ path, preamble }) {
  const file = resolve(root, path)
  const lines = readFileSync(file, 'utf8').split('\n')

  const indexStart = lines.findIndex((l) => l === INDEX_HEADING)
  if (indexStart === -1) {
    console.error(`log-index-gate: ${path} has no "${INDEX_HEADING}" section.`)
    return null
  }
  const indexEnd = lines.findIndex((l, i) => i > indexStart && /^## /.test(l))
  const indexBody = lines.slice(indexStart, indexEnd === -1 ? undefined : indexEnd).join('\n')

  const linked = new Set([...indexBody.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]))
  const skip = new Set([...preamble, 'Index'])
  const sections = anchorsOf(lines).filter((s) => !skip.has(s.title))

  const overlong = []
  for (const line of indexBody.split('\n')) {
    const entry = /^- \[.*?\]\(#[^)]+\)\s+—\s+(.*)$/.exec(line)
    if (entry && entry[1].length > HOOK_LIMIT) {
      overlong.push({ line, length: entry[1].length })
    }
  }

  const missing = sections.filter((s) => !linked.has(s.anchor))
  const dangling = [...linked].filter((a) => !sections.some((s) => s.anchor === a))
  if (!missing.length && !dangling.length && !overlong.length) return sections.length

  console.error(`log-index-gate: ${path} and its index disagree.\n`)
  for (const s of missing) {
    console.error(`  no index line for section:  ${s.title}\n    add:  - [${s.title}](#${s.anchor}) — <what you would come looking for>`)
  }
  for (const a of dangling) {
    console.error(`  index points at a section that does not exist:  #${a}`)
  }
  for (const { line, length } of overlong) {
    console.error(
      `  index hook is ${length} characters, the limit is ${HOOK_LIMIT}:\n    ${line.slice(0, 100)}…`,
    )
  }
  console.error('')
  return null
}

/**
 * Checks that a split document's README links every file beside it. Returns
 * the number of files, or null when one is missing from the README.
 */
function checkReadme(dir) {
  const names = readdirSync(resolve(root, dir)).filter((n) => n.endsWith('.md') && n !== 'README.md')
  const readme = readFileSync(resolve(root, dir, 'README.md'), 'utf8')
  const missing = names.filter((n) => !readme.includes(`](${n})`))
  if (!missing.length) return names.length
  console.error(`log-index-gate: ${dir}/README.md does not link every file beside it.\n`)
  for (const n of missing) console.error(`  not linked:  ${n}`)
  console.error('')
  return null
}

const results = DOCUMENTS.map((doc) => [doc.path, check(doc)])
const readmes = SPLIT.map((dir) => [dir, checkReadme(dir)])
if (results.some(([, n]) => n === null) || readmes.some(([, n]) => n === null)) {
  console.error('The index is read instead of the document; a section missing from it is unreachable.')
  process.exit(1)
}

const sections = results.reduce((sum, [, n]) => sum + n, 0)
console.log(
  `log-index-gate: ok (${results.length} ledger files, ${sections} sections, all indexed; ` +
    `${readmes.length} split documents, every file linked from its README)`,
)
