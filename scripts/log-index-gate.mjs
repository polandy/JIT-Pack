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
 * The ADRs are a split document too, and their index carries one more claim:
 * each decision's status. That column is how a reader learns that ADR-018 no
 * longer holds without opening it, so the status is a fixed value — Accepted,
 * or Superseded by ADR-NNN — and the index must repeat the file's. A date or
 * an amendment note on that line is history, and the history is in git.
 * For the same reason an ADR carries no `Amendment` or `Addendum` section:
 * a later change rewrites the decision to what holds, so the file never asks
 * its reader to replay a sequence of edits to learn the rule.
 *
 * A folded amendment leaves its citations behind: a concept note or a code
 * comment that sends its reader to amendment 3 of an ADR points at a section
 * that no longer exists. So outside the append-only records, which keep their
 * history by design, no tracked file may point at an ADR's amendment or
 * addendum; it cites the ADR, and its section where one names the matter.
 *
 * Node built-ins only, so it needs no install; wired into `make ci` and the CI
 * client job beside the other two node gates.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** Where the decisions live; every `ADR-NNN_*.md` in it is one. */
const ADR_DIR = 'dev-docs/adr'

/** An ADR's file name, capturing its number. */
const ADR_FILE = /^(ADR-\d{3})_.*\.md$/

/** The one line that says whether a decision still holds. */
const STATUS_LINE = '**Status:** '

/** The whole status vocabulary: a decision holds, or a named later one replaced it. */
const STATUS = /^(Accepted|Superseded by (ADR-\d{3}))$/

/**
 * A heading, or a label opening any line — indented, bulleted or bold — that
 * appends a change instead of rewriting the decision. The label ends in a
 * colon, so a wrapped line that cites the PRD's "Addendum 3.21" stays prose.
 */
const APPENDED_SECTION =
  /^#+ .*(Amend|Addend)|^\*\*(Amend|Addend)|^\s*(?:[-*]\s+)?\**(?:Amend|Addend)\w*(?: \d+)?(?: \([^)]*\))?\**:/

/**
 * Checks the ADRs' statuses against the vocabulary and against the README's
 * index, and refuses an amendment or addendum section. Takes the files as
 * `{ name, text }` and the README's text, and returns one message per
 * disagreement — none when they agree.
 */
export function checkAdrs(files, readme) {
  const errors = []
  const byNumber = new Map()
  for (const { name } of files) {
    const number = ADR_FILE.exec(name)[1]
    byNumber.set(number, [...(byNumber.get(number) ?? []), name])
  }
  for (const [number, names] of byNumber) {
    if (names.length > 1) {
      errors.push(`${number} is taken by two files, so a reference to it names neither: ${names.join(', ')}`)
    }
  }

  const indexed = new Map()
  for (const line of readme.split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    const link = /^\[\d{3}\]\(([^)]+)\)$/.exec(cells[1] ?? '')
    if (link) indexed.set(link[1], cells.at(-2))
  }

  for (const { name, text } of files) {
    text.split('\n').forEach((l, i) => {
      if (APPENDED_SECTION.test(l)) {
        errors.push(`${name}:${i + 1}: "${l}" — fold the change into the decision; an ADR states what holds`)
      }
    })
  }

  for (const { name, text } of files) {
    const number = ADR_FILE.exec(name)[1]
    const line = text.split('\n').find((l) => l.startsWith(STATUS_LINE.trimEnd()))
    if (line === undefined) {
      errors.push(`${name} has no "${STATUS_LINE.trim()}" line`)
      continue
    }
    const status = line.slice(STATUS_LINE.length).trim()
    const match = STATUS.exec(status)
    if (!match) {
      errors.push(`${name}: status "${status}" is not "Accepted" or "Superseded by ADR-NNN"`)
      continue
    }
    const successor = match[2]
    if (successor === number || (successor && !byNumber.has(successor))) {
      errors.push(`${name} is superseded by ${successor}, which is not another ADR in ${ADR_DIR}`)
      continue
    }
    if (!indexed.has(name)) {
      errors.push(`${name} has no row in ${ADR_DIR}/README.md's index`)
    } else if (indexed.get(name) !== status) {
      errors.push(`${name}: the index says "${indexed.get(name)}", the file says "${status}"`)
    }
  }
  return errors
}

/** Reads the ADR directory and reports what `checkAdrs` finds. Returns the number of ADRs, or null. */
function checkAdrDir() {
  const files = readdirSync(resolve(root, ADR_DIR))
    .filter((name) => ADR_FILE.test(name))
    .map((name) => ({ name, text: readFileSync(resolve(root, ADR_DIR, name), 'utf8') }))
  const errors = checkAdrs(files, readFileSync(resolve(root, ADR_DIR, 'README.md'), 'utf8'))
  if (!errors.length) return files.length
  console.error(`log-index-gate: the ADRs break their contract (status, index, no amendment section).\n`)
  for (const e of errors) console.error(`  ${e}`)
  console.error('')
  return null
}

/**
 * The files that keep their history and may cite what an ADR once said: the two
 * ledgers, the generated changelog, the deviations record — and this gate's own
 * test, which has to spell out what it refuses.
 */
const EXEMPT = [...LEDGERS.map((dir) => `${dir}/`), 'CHANGELOG.md', 'DEVIATIONS.md', 'scripts/log-index-gate.test.mjs']

/** The tracked files a pointer can hide in: prose, code, schema, workflows. */
const POINTER_SOURCES = /\.(md|ts|vue|go|mjs|sql|ya?ml|sh|html)$/

/**
 * What may stand between two words of a pointer: whitespace across a wrapped
 * line, and the comment or quote marker that opens the next one.
 */
const GAP = String.raw`[\s*/#>]+`

/**
 * "ADR-NNN amendment 3", "ADR-NNN's amendment", "ADR-NNN overlay amendment",
 * "ADR-NNN addendum", "an amendment to ADR-NNN". The addendum takes no word
 * between, because "ADR-NNN and Addendum 3.21" cites the PRD addendum beside it.
 */
const AMENDMENT_POINTER = new RegExp(
  [
    String.raw`ADR-\d{3}(?:['’]s)?(?:${GAP}[\w-]+)?${GAP}amendments?\b`,
    String.raw`ADR-\d{3}(?:['’]s)?${GAP}addend(?:um|a)\b`,
    String.raw`\b(?:amendment|addendum)s?(?:${GAP}\d+)?${GAP}(?:to|of|in)${GAP}ADR-\d{3}`,
  ].join('|'),
  'gi',
)

/** Whether a repository path keeps its history and so may cite an amendment. */
export function isExempt(path) {
  return EXEMPT.some((e) => (e.endsWith('/') ? path.startsWith(e) : path === e))
}

/**
 * Finds every pointer to an ADR amendment or addendum in `{ path, text }`
 * files and returns one message per pointer, with its line.
 */
export function findAmendmentPointers(files) {
  const errors = []
  for (const { path, text } of files) {
    for (const match of text.matchAll(AMENDMENT_POINTER)) {
      const line = text.slice(0, match.index).split('\n').length
      const pointer = match[0].replace(/\s+/g, ' ')
      errors.push(`${path}:${line}: "${pointer}" — the amendment is folded into the ADR; cite the ADR and its section`)
    }
  }
  return errors
}

/**
 * Reads the tracked files outside the exempt records and reports what
 * `findAmendmentPointers` finds. Tracked, because an untracked worklist in the
 * main checkout is nobody's document yet. Returns the number of files, or null.
 */
function checkAmendmentPointers() {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((path) => POINTER_SOURCES.test(path) && !isExempt(path))
    .map((path) => ({ path, text: readFileSync(resolve(root, path), 'utf8') }))
  const errors = findAmendmentPointers(files)
  if (!errors.length) return files.length
  console.error('log-index-gate: a document points at an ADR amendment that was folded away.\n')
  for (const e of errors) console.error(`  ${e}`)
  console.error('')
  return null
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()

function main() {
  const results = DOCUMENTS.map((doc) => [doc.path, check(doc)])
  const readmes = SPLIT.map((dir) => [dir, checkReadme(dir)])
  const adrs = checkAdrDir()
  const pointerFiles = checkAmendmentPointers()
  if (
    results.some(([, n]) => n === null) ||
    readmes.some(([, n]) => n === null) ||
    adrs === null ||
    pointerFiles === null
  ) {
    console.error('The index is read instead of the document; a section missing from it is unreachable.')
    process.exit(1)
  }

  const sections = results.reduce((sum, [, n]) => sum + n, 0)
  console.log(
    `log-index-gate: ok (${results.length} ledger files, ${sections} sections, all indexed; ` +
      `${readmes.length} split documents, every file linked from its README; ` +
      `${adrs} ADRs, each status in the vocabulary and in the index, none with an amendment section; ` +
      `${pointerFiles} files, none pointing at an amendment)`,
  )
}
