/**
 * Holds every E2E case id in the UI-Test-Spec to one meaning.
 *
 * An id *defined twice* — one promise from an original catalogue, a different
 * one from a rebuild — breaks traceability silently. The suite implements one
 * meaning per number, so a **green** test reads as coverage of a promise
 * nothing asserts, and the traceability matrix points FRs at the half nobody
 * can see.
 *
 * Nothing catches it by eye. The commits that cause it are pure additions to
 * a long bulleted list — the same id can be defined twice inside a single
 * commit — and every automatic signal moves the *reassuring* way: the count of
 * ids with a test goes up each time. It is the shape a checklist is worst at
 * and a script is best at.
 *
 * The rule: a case id is defined by exactly one bullet. A retired entry stays
 * in the file struck through — that is deliberate, so a reader arriving from
 * an old commit finds out what happened to the id it names — but it stays as
 * the *same* entry, re-headed, never as a second definition of the number.
 *
 * **Table rows and the suite count too (T-4).** The spec defines its
 * cross-screen cases as *table rows* (§4's G-*, §6's NFR-*), so a gate reading
 * only bullets would leave those ids outside it — a duplicate among them, or
 * between a row and a bullet, invisible. And an id in a test title is a
 * coverage claim, so it must name an entry in the spec. Both are checked here;
 * the second is why a heading may name several ids (`E2E-M17-07/07b`), which
 * is how the file writes an entry that defines a case and its sibling.
 *
 * Node built-ins only, so it needs no install; wired into `make ci` beside
 * the other node gates.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/* Run from the repository root or from `client/`, like the sibling gates. */
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')
const SPEC = resolve(root, 'dev-docs/UI_Test_Spec_v1.0.md')


/**
 * A line that *defines a live case*: a top-level bullet headed by the id and
 * not struck through. A struck entry deliberately keeps its original number —
 * that is how a reader arriving from an old commit finds out what happened to
 * the id it names — so it is a tombstone, not a second definition, and only
 * the live ones may collide.
 */
const DEFINITION = /^\* \*\*(E2E-[A-Z0-9]+-\d+[a-z]*(?:\/\d+[a-z]*)*)/gm

/**
 * A row of §4's or §6's tables: `| E2E-G2-01 | … |`. A struck row reads
 * `| ~~E2E-…`, so the space after the pipe is what separates a definition
 * from a tombstone, exactly as the bold does for a bullet.
 */
const ROW_DEFINITION = /^\| (E2E-[A-Z0-9]+-\d+[a-z]*)\b/gm

/** Every id in a test title — one entry per id, so a two-id title counts twice. */
const TITLE_IDS = /E2E-[A-Z0-9]+-\d+[a-z]*/g

const spec = readFileSync(SPEC, 'utf8')

/**
 * `E2E-M17-07/07b` is one entry defining two ids — the shorthand the file
 * already uses where a case and its sibling share a promise and a paragraph.
 * The suffixes inherit the head's screen, so `07/07b` is M17's, not a
 * separate series.
 */
function idsOf(heading) {
  const [head, ...rest] = heading.split('/')
  const prefix = head.slice(0, head.lastIndexOf('-') + 1)
  return [head, ...rest.map((suffix) => prefix + suffix)]
}

const seen = new Map()
const count = (id) => seen.set(id, (seen.get(id) ?? 0) + 1)
for (const [, heading] of spec.matchAll(DEFINITION)) idsOf(heading).forEach(count)

/*
 * Rows are counted separately from bullets. A table row is the definition and
 * the bullets under §6 are commentary on it — `E2E-NFR-01` is legitimately
 * both — so a collision is a duplicate *within one kind*, which is the shape
 * that cost four green tests their meaning.
 */
const rows = new Map()
for (const [, id] of spec.matchAll(ROW_DEFINITION)) rows.set(id, (rows.get(id) ?? 0) + 1)
for (const [id, n] of rows) if (!seen.has(id)) seen.set(id, n)

/*
 * A guard on the guard. Every assertion below is about ids this scan found,
 * so a scan that finds none passes them all — and it would find none if the
 * spec were renamed or its bullet format changed, which is exactly when the
 * check stops being run and nothing says so.
 */
if (seen.size === 0) {
  console.error(
    `case-id-gate: found no case ids at all in ${SPEC}.\n` +
      'Either the file moved or its entry format changed — the gate is not\n' +
      'checking anything, which is worse than failing.',
  )
  process.exit(1)
}

const collisions = [...seen].filter(([, n]) => n > 1).map(([id]) => id)

if (collisions.length > 0) {
  console.error(
    `case-id-gate: ${collisions.length} case id(s) defined more than once in ${SPEC}:\n` +
      collisions.map((id) => `  ${id}`).join('\n') +
      '\n\nA number means what the suite implements. Give the newer promise its own\n' +
      'id, and leave the older entry in place — struck through, re-headed, and\n' +
      'saying where its promise went — so a reader arriving from an old commit\n' +
      'can still find out what happened to the id it names.',
  )
  process.exit(1)
}

const rowCollisions = [...rows].filter(([, n]) => n > 1).map(([id]) => id)
if (rowCollisions.length > 0) {
  console.error(
    `case-id-gate: ${rowCollisions.length} case id(s) with more than one table row in ${SPEC}:\n` +
      rowCollisions.map((id) => `  ${id}`).join('\n'),
  )
  process.exit(1)
}

/*
 * The second half, added by T-4: an id in a test title is a coverage claim,
 * and a claim against an id the spec does not define points at nothing. The
 * spec is the promise; a title that invents a number has no promise to keep.
 */
const SUITE = resolve(root, 'client/e2e')

function specFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) return specFiles(path)
    return entry.name.endsWith('.spec.ts') ? [path] : []
  })
}

const claimed = new Map()
for (const file of specFiles(SUITE)) {
  const source = readFileSync(file, 'utf8')
  for (const [, title] of source.matchAll(/\btest\(\s*['"`]([^'"`]*)/g)) {
    for (const id of title.match(TITLE_IDS) ?? []) {
      if (!claimed.has(id)) claimed.set(id, file.slice(root.length + 1))
    }
  }
}

if (claimed.size === 0) {
  console.error(
    `case-id-gate: found no case ids in any test title under ${SUITE}.\n` +
      'Either the suite moved or titles stopped carrying ids — the second half\n' +
      'of this gate is not checking anything, which is worse than failing.',
  )
  process.exit(1)
}

const undefinedIds = [...claimed].filter(([id]) => !seen.has(id))
if (undefinedIds.length > 0) {
  console.error(
    `case-id-gate: ${undefinedIds.length} case id(s) claimed by a test title but ` +
      `defined nowhere in ${SPEC}:\n` +
      undefinedIds.map(([id, file]) => `  ${id}  (${file})`).join('\n') +
      '\n\nAn id in a title is a coverage claim. Give it an entry — or, where the\n' +
      'promise belongs to a sibling’s paragraph, put it in that entry’s heading\n' +
      '(`E2E-M17-07/07b`), which is how the file already says one entry defines two.',
  )
  process.exit(1)
}

console.log(
  `case-id-gate: ok — ${seen.size} case ids, one definition each; ` +
    `${claimed.size} claimed by a test title, all defined`,
)
