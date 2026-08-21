/**
 * Holds the implementation log's index against the log itself: every section
 * has an index line, and every index line points at a section that exists.
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
const LOG = resolve(root, 'dev-docs/implementation-log.md')

/** Headings above the index describe the file itself and are not entries in it. */
const PREAMBLE = new Set(['What earns an entry', 'Index'])

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
    anchors.push({ title, anchor, preamble: PREAMBLE.has(title) })
  }
  return anchors
}

const text = readFileSync(LOG, 'utf8')
const lines = text.split('\n')

const indexStart = lines.findIndex((l) => l === '## Index')
if (indexStart === -1) {
  console.error('log-index-gate: dev-docs/implementation-log.md has no "## Index" section.')
  process.exit(1)
}
const indexEnd = lines.findIndex((l, i) => i > indexStart && /^## /.test(l))
const indexBody = lines.slice(indexStart, indexEnd === -1 ? undefined : indexEnd).join('\n')

const linked = new Set([...indexBody.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]))
const sections = anchorsOf(lines).filter((s) => !s.preamble)

const missing = sections.filter((s) => !linked.has(s.anchor))
const dangling = [...linked].filter((a) => !sections.some((s) => s.anchor === a))

if (missing.length || dangling.length) {
  console.error('log-index-gate: the implementation log and its index disagree.\n')
  for (const s of missing) {
    console.error(`  no index line for section:  ${s.title}\n    add:  - [${s.title}](#${s.anchor}) — <what you would come looking for>`)
  }
  for (const a of dangling) {
    console.error(`  index points at a section that does not exist:  #${a}`)
  }
  console.error('\nThe index is read instead of the log; a section missing from it is unreachable.')
  process.exit(1)
}

console.log(`log-index-gate: ok (${sections.length} sections, all indexed)`)
