/**
 * Holds a document's index against the document itself: every section has an
 * index line, and every index line points at a section that exists.
 *
 * The index is what makes a 275 KB append-only file usable — it is meant to be
 * read *instead of* the log, so that a reader can tell in one screen whether
 * anything in there concerns them. That only works while it is complete: an
 * appended section with no index line is invisible to exactly the reader the
 * index was written for, and it fails silently, because both files stay
 * perfectly valid Markdown. The same failure the sibling gates were written
 * for — a claim a document makes about itself that nothing checks.
 *
 * Node built-ins only, so it needs no install; wired into `make ci` and the CI
 * client job beside the other two node gates.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * `make ci` runs this from the repository root and the CI client job runs it
 * from `client/`. Both sibling gates settle that with this line, so this one
 * does too rather than inventing a third convention.
 */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')

/**
 * Every document that claims to have an index. `preamble` names the headings
 * that describe the file itself rather than being entries in it — the index
 * heading always counts as one.
 *
 * `e2e-tests.md` joined on 2026-09-03: it had grown 70 undated narrative
 * sections behind its status table with nothing naming them, which is the
 * failure this gate already existed for. Two documents rather than one is what
 * turned the hard-coded path into this list.
 */
const DOCUMENTS = [
  { path: 'dev-docs/implementation-log.md', preamble: ['What earns an entry'] },
  { path: 'dev-docs/e2e-tests.md', preamble: [] },
]

/** The heading whose body holds the index lines, in every document. */
const INDEX_HEADING = '## Index'

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

  const missing = sections.filter((s) => !linked.has(s.anchor))
  const dangling = [...linked].filter((a) => !sections.some((s) => s.anchor === a))
  if (!missing.length && !dangling.length) return sections.length

  console.error(`log-index-gate: ${path} and its index disagree.\n`)
  for (const s of missing) {
    console.error(`  no index line for section:  ${s.title}\n    add:  - [${s.title}](#${s.anchor}) — <what you would come looking for>`)
  }
  for (const a of dangling) {
    console.error(`  index points at a section that does not exist:  #${a}`)
  }
  console.error('')
  return null
}

const results = DOCUMENTS.map((doc) => [doc.path, check(doc)])
if (results.some(([, n]) => n === null)) {
  console.error('The index is read instead of the document; a section missing from it is unreachable.')
  process.exit(1)
}

console.log(
  `log-index-gate: ok (${results.map(([p, n]) => `${p}: ${n} sections`).join(', ')}, all indexed)`,
)
